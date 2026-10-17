"""Language-agnostic forbidden-term matching for community moderation.

Why this replaces the old matcher
---------------------------------
The previous implementation searched with ``re.compile(re.escape(word))`` - a
bare substring test - under a comment that claimed it was a word-boundary
match. Two consequences, both fatal for a school LMS:

* False positives. One short term rejects *assignment*, *class*, *assess*,
  *pass* and *compass*, because none of those is a boundary-aware hit away.
* False negatives. ``b@ss``, ``f.u.c.k`` and Cyrillic lookalikes all sailed
  straight through, so the filter bought nothing.

What this module does instead
-----------------------------
Both the haystack and every needle are pushed through the *same* folding
(NFKC compatibility forms, case, Latin diacritics, leet-speak digits and
symbols, cross-script homoglyphs, intra-word punctuation), then matching is
chosen per writing system:

* Scripts written with word separators (Latin, Cyrillic, Greek, ...) match on
  whole tokens, so *class* can never match the term *ass*.
* Scripts written without separators (Sinhala, Tamil, Thai, CJK, ...) match by
  substring, because token boundaries do not exist there.

Two folding passes are tried, not one
-------------------------------------
Letter-run collapsing is needed to catch ``fuuuuck``, but folding it into the
single canonical form destroys ordinary English: *hello* collapses to *helo*
and *class* to *clas*, so a term spelled correctly would stop matching its own
word. So each side is folded twice - once plain, once with runs collapsed -
and a term matches if it hits either form. Both sides use the same pair, so
the passes cannot desynchronise.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, List, NamedTuple, Sequence, Tuple

# Leet-speak digits and symbols mapped onto the letter they stand in for.
# Deliberately conservative: `!` and `|` are excluded because they are far more
# often punctuation than substitutions, and folding them would mangle ordinary
# words ("well!" -> "welli").
_LEET_MAP = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "8": "b",
    "@": "a",
    "$": "s",
    "+": "t",
}

# Cyrillic and Greek characters that render identically to a Latin letter.
_HOMOGLYPHS = {
    # Cyrillic lowercase
    "а": "a", "в": "b", "с": "c", "е": "e", "н": "h", "і": "i",
    "ј": "j", "к": "k", "м": "m", "о": "o", "р": "p", "ѕ": "s",
    "т": "t", "у": "y", "х": "x", "һ": "h", "г": "r",
    # Cyrillic uppercase
    "А": "a", "В": "b", "С": "c", "Е": "e", "Н": "h", "І": "i",
    "Ј": "j", "К": "k", "М": "m", "О": "o", "Р": "p", "Ѕ": "s",
    "Т": "t", "У": "y", "Х": "x",
    # Greek lowercase
    "α": "a", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o",
    "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
    # Greek uppercase
    "Α": "a", "Β": "b", "Ε": "e", "Ζ": "z", "Η": "h", "Ι": "i",
    "Κ": "k", "Μ": "m", "Ν": "n", "Ο": "o", "Ρ": "p", "Τ": "t",
    "Υ": "y", "Χ": "x",
    # Other lookalikes that show up in obfuscation
    "ı": "i", "ȷ": "j", "ǀ": "l", "ǁ": "l", "ʟ": "l",
    "ɑ": "a", "ɡ": "g", "ɩ": "i", "ɪ": "i", "ѡ": "w",
    "ԁ": "d", "ᴀ": "a", "ᴠ": "v", "ᴡ": "w", "ᴢ": "z",
}

# Scripts written WITHOUT word separators. Token boundaries do not exist here,
# so a substring test is the only correct primitive - and for Sinhala/Tamil it
# is the only one that finds anything at all.
_UNSPACED_RANGES: Tuple[Tuple[int, int], ...] = (
    (0x0900, 0x097F),  # Devanagari
    (0x0980, 0x09FF),  # Bengali
    (0x0A00, 0x0A7F),  # Gurmukhi
    (0x0A80, 0x0AFF),  # Gujarati
    (0x0B00, 0x0B7F),  # Oriya
    (0x0B80, 0x0BFF),  # Tamil
    (0x0C00, 0x0C7F),  # Telugu
    (0x0C80, 0x0CFF),  # Kannada
    (0x0D00, 0x0D7F),  # Malayalam
    (0x0D80, 0x0DFF),  # Sinhala
    (0x0E00, 0x0E7F),  # Thai
    (0x0E80, 0x0EFF),  # Lao
    (0x0F00, 0x0FFF),  # Tibetan
    (0x1000, 0x109F),  # Myanmar
    (0x1780, 0x17FF),  # Khmer
    (0x3040, 0x30FF),  # Hiragana + Katakana
    (0x3400, 0x4DBF),  # CJK Unified (ext A)
    (0x4E00, 0x9FFF),  # CJK Unified
    (0xF900, 0xFAFF),  # CJK Compatibility
    (0xAC00, 0xD7AF),  # Hangul syllables (Korean)
)

# Ranges whose combining marks are DIACRITICS to be removed. Applying the
# Latin rule everywhere is what destroyed Sinhala: its virama (U+0DCA) is a
# combining mark with a non-zero combining class, so stripping "accents" turned
# whole Sinhala and Tamil words into nothing.
_ACCENT_STRIPPABLE_RANGES: Tuple[Tuple[int, int], ...] = (
    (0x00C0, 0x024F),  # Latin-1 Supplement + Latin Extended-A/B (precomposed)
    (0x0370, 0x03FF),  # Greek
    (0x1E00, 0x1EFF),  # Latin Extended Additional
    (0x1F00, 0x1FFF),  # Greek Extended
    (0x0400, 0x04FF),  # Cyrillic
    (0x0500, 0x052F),  # Cyrillic Supplement
)

# Standalone combining diacritics (the NFD residue of the ranges above).
_COMBINING_DIACRITIC = (0x0300, 0x036F)


class TermMatch(NamedTuple):
    """A forbidden term located in the ORIGINAL text.

    ``start``/``end`` index the caller's original string, not a folded copy, so
    masking rewrites the real text instead of the normalised form.
    """

    start: int
    end: int
    term: str


def _in_ranges(cp: int, ranges: Sequence[Tuple[int, int]]) -> bool:
    return any(low <= cp <= high for low, high in ranges)


def _is_unspaced_script(text: str) -> bool:
    """True when ``text`` contains a character from a script with no spaces."""
    return any(_in_ranges(ord(ch), _UNSPACED_RANGES) for ch in text)


def _fold_char(ch: str) -> str:
    """Fold a single character onto its canonical form (may map to one char)."""
    ch = _HOMOGLYPHS.get(ch, ch)
    return _LEET_MAP.get(ch, ch)


def _is_word_char(ch: str) -> bool:
    """True when ``ch`` carries meaning and must survive folding.

    The explicit script-range fallback matters: ``str.isalnum()`` consults the
    runtime's Unicode tables, and a character they consider unassigned would
    otherwise be dropped silently - which disables filtering for that script
    entirely rather than failing loudly.
    """
    if ch.isalnum():
        return True
    if unicodedata.category(ch).startswith("M"):
        return True
    return _in_ranges(ord(ch), _UNSPACED_RANGES)


def _fold_text(text: str, collapse_runs: bool) -> Tuple[str, List[int]]:
    """Fold ``text`` and return it with a map back to the original offsets."""
    if not text:
        return "", []

    out: List[str] = []
    index_map: List[int] = []

    for orig_index, raw in enumerate(text):
        # NFKC folds fullwidth/compatibility forms (ＡＳＳ -> ASS).
        for ch in unicodedata.normalize("NFKC", raw):
            cp = ord(ch)
            if _in_ranges(cp, (_COMBINING_DIACRITIC,)):
                continue  # bare diacritic: always drop
            if _in_ranges(cp, _ACCENT_STRIPPABLE_RANGES):
                # Precomposed accent -> drop the combining residue.
                ch = "".join(
                    c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c)
                )
            ch = _fold_char(ch.casefold())
            if not ch:
                continue
            if ch.isspace():
                if out and out[-1] != " ":
                    out.append(" ")
                    index_map.append(orig_index)
                continue
            if not _is_word_char(ch):
                continue  # punctuation and symbols are noise: f.u.c.k -> fuck
            if collapse_runs and out and out[-1] == ch:
                continue
            out.append(ch)
            index_map.append(orig_index)

    normalized = "".join(out).strip()
    # `strip()` can drop a leading space, which would shift the offset map.
    lead = 0
    while lead < len(out) and out[lead] == " ":
        lead += 1
    return normalized, index_map[lead:]


def normalize(text: str) -> str:
    """Canonical fold used for matching (letter runs left intact)."""
    return _fold_text(text, collapse_runs=False)[0]


def normalize_collapsed(text: str) -> str:
    """Fold with runs of a repeated character collapsed: ``fuuuck`` -> ``fuck``."""
    return _fold_text(text, collapse_runs=True)[0]


def normalize_with_map(text: str) -> Tuple[str, List[int]]:
    """Canonical fold plus the offset map back to ``text``."""
    return _fold_text(text, collapse_runs=False)


def _tokenize(normalized: str) -> List[Tuple[int, int]]:
    """Return ``(start, end)`` spans of whitespace-delimited tokens."""
    return [(m.start(), m.end()) for m in re.finditer(r"\S+", normalized)]


def _find_all_runs(
    hay_tokens: Sequence[str], hay_spans: Sequence[Tuple[int, int]], needle_tokens: Sequence[str]
) -> List[Tuple[int, int]]:
    """Every offset at which ``needle_tokens`` appears as a contiguous run.

    All occurrences are returned, not just the first, so masking redacts every
    instance instead of only the leading one.
    """
    n, m = len(needle_tokens), len(hay_tokens)
    if n == 0 or n > m:
        return []
    return [
        (hay_spans[i][0], hay_spans[i + n - 1][1])
        for i in range(m - n + 1)
        if hay_tokens[i : i + n] == needle_tokens
    ]


def _matches_in_form(
    normalized: str, terms: Sequence[str]
) -> List[Tuple[int, int, str]]:
    """Locate ``terms`` inside one already-folded form of the haystack."""
    hay_spans = _tokenize(normalized)
    hay_tokens = [normalized[s:e] for s, e in hay_spans]

    found: List[Tuple[int, int, str]] = []
    seen: set = set()
    for raw_term in terms:
        if not raw_term or not raw_term.strip():
            continue
        # The needle is folded with BOTH passes too, so the two forms stay
        # directly comparable to each other.
        for needle in (normalize(raw_term), normalize_collapsed(raw_term)):
            if not needle:
                continue
            if _is_unspaced_script(needle):
                start = normalized.find(needle)
                while start != -1:
                    hit = (start, start + len(needle), raw_term)
                    if hit not in seen:
                        seen.add(hit)
                        found.append(hit)
                    start = normalized.find(needle, start + 1)
                continue
            needle_tokens = needle.split()
            for start, end in _find_all_runs(hay_tokens, hay_spans, needle_tokens):
                hit = (start, end, raw_term)
                if hit not in seen:
                    seen.add(hit)
                    found.append(hit)
    return found


def find_forbidden_terms(
    text: str, terms: Sequence[str]
) -> List[TermMatch]:
    """Return every occurrence of ``terms`` in ``text``, with original offsets.

    Both folding passes (plain and run-collapsed) are searched, and a term hits
    if it matches either. Overlapping hits collapse to the longest span at each
    start, so masking a phrase does not leave its trailing half visible.
    """
    if not text or not terms:
        return []

    terms = list(terms)
    by_span: dict[Tuple[int, int], TermMatch] = {}

    for collapse in (False, True):
        normalized, index_map = _fold_text(text, collapse_runs=collapse)
        if not normalized or not index_map:
            continue
        for start, end, term in _matches_in_form(normalized, terms):
            if end - 1 >= len(index_map):
                continue
            orig = (index_map[start], index_map[end - 1] + 1)
            existing = by_span.get(orig)
            if existing is None:
                by_span[orig] = TermMatch(orig[0], orig[1], term)

    matches = sorted(by_span.values(), key=lambda m: (m.start, -(m.end - m.start)))

    # Drop any span fully contained in one already kept, so masking cannot
    # redraw text twice.
    pruned: List[TermMatch] = []
    last_end = -1
    for m in matches:
        if m.end <= last_end:
            continue
        pruned.append(m)
        last_end = m.end
    return pruned


def mask_forbidden_terms(text: str, matches: Iterable[TermMatch], char: str = "*") -> str:
    """Replace every matched span of ``text`` with ``char``.

    Whitespace inside a span is preserved so masked text stays readable.
    """
    if not text:
        return text
    spans = sorted(((m.start, m.end) for m in matches), key=lambda s: s[0])
    if not spans:
        return text

    out: List[str] = []
    cursor = 0
    for start, end in spans:
        start = max(start, cursor)
        end = min(end, len(text))
        if end <= start:
            continue
        out.append(text[cursor:start])
        out.append("".join(c if c.isspace() else char for c in text[start:end]))
        cursor = end
    out.append(text[cursor:])
    return "".join(out)