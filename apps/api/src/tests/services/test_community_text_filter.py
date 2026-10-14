"""Tests for src/services/communities/text_filter.py.

Two classes of bug are pinned here. The matcher this replaces used a bare
substring search, which (a) rejected ordinary coursework and (b) accepted
obfuscated spellings. Both directions matter, so both are asserted.
"""

from src.services.communities.text_filter import (
    find_forbidden_terms,
    mask_forbidden_terms,
    normalize,
)


class TestNormalize:
    def test_case_and_accents_fold(self):
        assert normalize("HeLLo") == "hello"
        # Combining acute accent folds away so it cannot dodge a term.
        assert normalize("ass\u0301") == "ass"  # a + combining acute

    def test_fullwidth_latin_folds_to_ascii(self):
        # NFKC maps fullwidth ASS -> ASS.
        assert normalize("\uff21\uff33\uff33") == "ass"

    def test_leet_symbols_fold(self):
        assert normalize("b@ss") == "bass"
        assert normalize("f4gg0t") == "faggot"

    def test_homoglyphs_fold_onto_latin(self):
        # Cyrillic a/e/o/c look identical to Latin.
        assert normalize("\u0430\u0435\u0441") == "aec"

    def test_punctuation_inside_a_word_is_dropped(self):
        assert normalize("f.u.c.k") == "fuck"
        assert normalize("f*u*c*k") == "fuck"

    def test_repeated_letters_collapse(self):
        assert normalize("fuuuuck") == "fuck"

    def test_whitespace_is_preserved_as_a_separator(self):
        assert normalize("hello   world") == "hello world"

    def test_empty(self):
        assert normalize("") == ""


class TestFalsePositives:
    """The regression that made the old matcher unusable in a school LMS."""

    def test_term_does_not_match_inside_a_longer_word(self):
        for term in ("ass", "bad", "hell"):
            assert find_forbidden_terms("class assignment assess pass", [term]) == []

    def test_academic_vocabulary_survives_a_short_term(self):
        haystack = "Please submit your assignment before class; I will assess it."
        assert find_forbidden_terms(haystack, ["ass"]) == []

    def test_does_not_match_a_substring_of_a_different_word(self):
        assert find_forbidden_terms("bass guitar lesson", ["ass"]) == []


class TestTruePositives:
    def test_standalone_word_matches(self):
        matches = find_forbidden_terms("This has BANNED text", ["banned"])
        assert len(matches) == 1
        assert matches[0].term == "banned"

    def test_leetspeak_variant_matches(self):
        matches = find_forbidden_terms("you are such an @$$", ["ass"])
        assert len(matches) == 1

    def test_separator_obfuscation_matches(self):
        assert find_forbidden_terms("f.u.c.k this", ["fuck"]) != []

    def test_repeated_letter_obfuscation_matches(self):
        assert find_forbidden_terms("fuuuck you", ["fuck"]) != []

    def test_homoglyph_obfuscation_matches(self):
        # Cyrillic а (U+0430) and ѕ (U+0455) standing in for Latin "ass".
        assert find_forbidden_terms("\u0430\u0455\u0455 off", ["ass"]) != []

    def test_multi_word_phrase_matches_as_a_run(self):
        matches = find_forbidden_terms("what the hell is going on", ["the hell"])
        assert len(matches) == 1
        assert matches[0].term == "the hell"


class TestMultilingual:
    def test_sinhala_is_matched_by_substring(self):
        # Sinhala has no word separators, so a token match would find nothing.
        text = "\u0dc7\u0dca\u0dc8\u0dcd\u0dc8\u0dca\u0dad \u0dca\u0dbb\u0dd0\u0daf\u0dca\u0dad\u0da2"
        assert find_forbidden_terms(text, ["\u0dc7\u0dca\u0dc8\u0dcd\u0dc8"]) != []

    def test_tamil_is_matched_by_substring(self):
        text = "\u0baa\u0bc1\u0bb3\u0bbf\u0b95\u0bb3\u0b95\u0bbe\u0b9a \u0b95\u0bb3\u0bbf\u0bb2\u0bbe"
        assert find_forbidden_terms(text, ["\u0baa\u0bc1\u0bb3\u0bbf"]) != []

    def test_sinhala_term_does_not_fire_on_latin_text(self):
        assert find_forbidden_terms("hello world", ["\u0dc7\u0dca\u0dc8\u0dcd\u0dc8"]) == []

    def test_latin_terms_still_apply_in_a_multilingual_post(self):
        matches = find_forbidden_terms(
            "\u0dc7\u0dca\u0dc8\u0dcd\u0dc8 \u0dca\u0d9a\u0dd2\u0dbb\u0dc1 this is banned",
            ["banned"],
        )
        assert len(matches) == 1


class TestMasking:
    def test_mask_replaces_only_the_match(self):
        text = "you are such an idiot"
        matches = find_forbidden_terms(text, ["idiot"])
        assert mask_forbidden_terms(text, matches) == "you are such an ****"

    def test_mask_preserves_surrounding_text_and_spacing(self):
        text = "go away, idiot, now"
        matches = find_forbidden_terms(text, ["idiot"])
        assert mask_forbidden_terms(text, matches) == "go away, *****, now"

    def test_mask_maps_offsets_back_through_normalisation(self):
        # The obfuscated span must be masked in the ORIGINAL text, not in the
        # folded copy. "f.u.c.k" is 7 characters, so it yields 7 stars - not
        # the 5 of the folded "fuck", and not a wholesale replacement.
        text = "you f.u.c.k"
        matches = find_forbidden_terms(text, ["fuck"])
        assert len(matches) == 1
        assert matches[0].start == 4
        assert matches[0].end == 11
        assert mask_forbidden_terms(text, matches) == "you *******"

    def test_mask_handles_multiple_and_adjacent_hits(self):
        text = "bad bad"
        matches = find_forbidden_terms(text, ["bad"])
        assert mask_forbidden_terms(text, matches) == "*** ***"

    def test_mask_of_nothing_is_identity(self):
        assert mask_forbidden_terms("clean text", []) == "clean text"