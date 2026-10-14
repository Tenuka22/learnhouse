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
Both the haystack and every needle are pushed through the *same*
normalisation, then matched per writing system:

* Scripts written with word separators (Latin, Cyrillic, Greek, ...) match on
  whole tokens, so *class* can never match the term *ass*.
* Scripts written without separators (Sinhala, Tamil, Thai, CJK, Khmer,
  Myanmar, Lao) match by substring, because token boundaries do not exist in
  those scripts and ``\\b`` would match almost nothing.

Normalisation folds: NFKC compatibility forms (fullwidth Latin), case,
combining marks (so ``àss`` folds to *ass*), leet-speak digits and symbols
(``0 1 3 4 5 7 8 @ $ +``), cross-script homoglyphs (Cyrillic/Greek lookalikes
onto Latin), intra-word punctuation and repeated characters.

Because both sides are normalised identically, folding cannot desynchronise
them: ``letter`` and ``leter`` fold the same way, so neither matches the
other's tokens.
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

# Unicode ranges for scripts that are written without word separators. Token
# boundaries do not exist in these, so a substring test is the correct
# primitive - and it is the only one that works for Sinhala/Tamil at all.
_UNSPACED_RANGES: Tuple[Tuple[int, int], ...] = (
    (0x0D80, 0x0DFF),  # Sinhala
    (0x0B80, 0x0BFF),  # Tamil
    (0x0E00, 0x0E7F),  # Thai
    (0x0E80, 0x0EFF),  # Lao
    (0x1000, 0x109F),  # Myanmar
    (0x1780, 0x17FF),  # Khmer
    (0x3040, 0x30FF),  # Hiragana + Katakana
    (0x3400, 0x4DBF),  # CJK Unified (ext A)
    (0x4E00, 0x9FFF),  # CJK Unified
    (0xF900, 0xFAFF),  # CJK Compatibility
    (0xAC00, 0xD7AF),  # Hangul syllables (Korean)
)


class TermMatch(NamedTuple):
    """A forbidden term located in the ORIGINAL text.

    ``start``/``end`` index the caller's original string, not the normalised
    form, so masking can rewrite the real text instead of the folded copy.
    """

    start: int
    end: int
    term: str


def _is_unspaced_script(text: str) -> bool:
    """True when ``text`` contains a character from a script with no spaces."""
    for ch in text:
        cp = ord(ch)
        for low, high in _UNSPACED_RANGES:
            if low <= cp <= high:
                return True
    return False


def _fold_char(ch: str) -> str:
    """Fold a single character onto its canonical form (may map to one char)."""
    ch = _HOMOGLYPHS.get(ch, ch)
    ch = _LEET_MAP.get(ch, ch)
    return ch


def normalize(text: str) -> str:
    """Fold ``text`` into the canonical form used for matching.

    Punctuation and symbols are dropped, whitespace is preserved as the token
    separator, and runs of a repeated character collapse to one.
    """
    if not text:
        return ""

    out: List[str] = []
    for raw in text:
        # NFKC folds fullwidth/compatibility forms (ＡＳＳ -> ASS).
        for ch in unicodedata.normalize("NFKC", raw):
            # Drop combining accents so "àss" and "ass" agree.
            ch = "".join(c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c))
            ch = _fold_char(ch.casefold())
            if not ch:
                continue
            if ch.isspace():
                if out and out[-1] != " ":
                    out.append(" ")
                continue
            # Keep only letters/digits; drop everything else as noise. This is
            # what turns "f.u.c.k" into "fuck".
            if not (ch.isalnum() or unicodedata.category(ch).startswith("M")):
                continue
            if out and out[-1] == ch:
                continue  # collapse runs: "fuuuuck" -> "fuck"
            out.append(ch)

    return "".join(out).strip()


def normalize_with_map(text: str) -> Tuple[str, List[int]]:
    """Like :func:`normalize`, but also return the offset map back to ``text``.

    ``index_map[i]`` is the index in ``text`` that produced normalised index
    ``i``.
    """
    if not text:
        return "", []

    out: List[str] = []
    index_map: List[int] = []
    for orig_index, raw in enumerate(text):
        for ch in unicodedata.normalize("NFKC", raw):
            ch = "".join(c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c))
            ch = _fold_char(ch.casefold())
            if not ch:
                continue
            if ch.isspace():
                if out and out[-1] != " ":
                    out.append(" ")
                    index_map.append(orig_index)
                continue
            if not (ch.isalnum() or unicodedata.category(ch).startswith("M")):
                continue
            if out and out[-1] == ch:
                continue
            out.append(ch)
            index_map.append(orig_index)

    normalized = "".join(out).strip()
    if normalized:
        # `strip()` can drop a leading space, which shifts the map by one.
        trimmed = len("".join(out)) - len("".join(out).lstrip())
        index_map = index_map[trimmed:]
    return normalized, index_map


def _tokenize(normalized: str) -> List[Tuple[int, int]]:
    """Return ``(start, end)`` spans of whitespace-delimited tokens."""
    spans: List[Tuple[int, int]] = []
    for match in re.finditer(r"\S+", normalized):
        spans.append((match.start(), match.end()))
    return spans


def _find_all_runs(
    hay_tokens: Sequence[str], hay_spans: Sequence[Tuple[int, int]], needle_tokens: Sequence[str]
) -> List[Tuple[int, int]]:
    """Every start offset at which ``needle_tokens`` appears contiguously.

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


def find_forbidden_terms(
    text: str, terms: Sequence[str]
) -> List[TermMatch]:
    """Return every occurrence of ``terms`` in ``text``, with original offsets.

    Overlapping hits are resolved by keeping the longest match at each start,
    so masking a phrase does not leave the trailing half of it visible.
    """
    if not text or not terms:
        return []

    normalized, index_map = normalize_with_map(text)
    if not normalized:
        return []

    # Spaced scripts: whole-token matching, so "ass" cannot hit "class".
    hay_spans = _tokenize(normalized)
    hay_tokens = [normalized[s:e] for s, e in hay_spans]

    matches: List[TermMatch] = []
    seen_spans = set()

    for raw_term in terms:
        if not raw_term or not raw_term.strip():
            continue
        needle = normalize(raw_term)
        if not needle:
            continue

        if _is_unspaced_script(needle):
            # No token boundaries in this script: substring is the only option.
            start = normalized.find(needle)
            while start != -1:
                end = start + len(needle)
                if (start, end) not in seen_spans:
                    seen_spans.add((start, end))
                    matches.append((start, end, raw_term))
                start = normalized.find(needle, start + 1)
            continue

        needle_tokens = needle.split()
        if not needle_tokens:
            continue
        for start, end in _find_all_runs(hay_tokens, hay_spans, needle_tokens):
            if (start, end) not in seen_spans:
                seen_spans.add((start, end))
                matches.append((start, end, raw_term))

    if not matches:
        return []

    # Map back to the original string.
    resolved = [
        TermMatch(index_map[start], index_map[end - 1] + 1, term) for start, end, term in matches
    ]
    resolved.sort(key=lambda m: (m.start, -(m.end - m.start)))
    return resolved


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