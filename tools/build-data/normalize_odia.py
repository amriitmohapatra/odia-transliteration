#!/usr/bin/env python3.14
"""
Canonical Unicode form for Odia text — the Python mirror of
`core/src/normalize.ts`.

The data pipeline sits at a boundary, so it obeys the same invariant as the
engine:

    RRA  =  U+0B21 + U+0B3C (nukta)      never U+0B5C
    RHA  =  U+0B22 + U+0B3C (nukta)      never U+0B5D

U+0B5C and U+0B5D carry a canonical decomposition and sit on the Unicode
composition-exclusion list, so NFC pulls them apart and never puts them back.
Vowel signs go the other way: NFC composes U+0B47 U+0B3E into U+0B4B.
U+0B5F (YYA) has no decomposition and is left alone.

A lexicon keyed on precomposed nukta forms silently stops matching after any
NFC pass. Odia's own name contains one, so this breaks common words, not edge
cases.

Every Odia string in this file is written with \\u escapes rather than
literals. The canonical and precomposed spellings of RRA/RHA are visually
identical, so code written with literals cannot be reviewed and a stray
copy-paste would quietly assert the opposite of what is intended.

Stdlib only. Run `python3 normalize_odia.py` to execute the self-test, which
asserts the same vectors as `core/test/normalize.test.ts`.
"""

from __future__ import annotations

import unicodedata

# --------------------------------------------------------------------- #
# Code points the rest of the pipeline refers to by name
# --------------------------------------------------------------------- #

#: U+0B3C ODIA SIGN NUKTA.
NUKTA = "\u0b3c"

#: U+0B4D ODIA SIGN VIRAMA (halanta).
VIRAMA = "\u0b4d"

#: RRA in canonical (decomposed) form: U+0B21 U+0B3C.
DDA_NUKTA = "\u0b21\u0b3c"

#: RHA in canonical (decomposed) form: U+0B22 U+0B3C.
DDHA_NUKTA = "\u0b22\u0b3c"

#: U+0B5C, the forbidden precomposed RRA.
PRECOMPOSED_DDA_NUKTA = "\u0b5c"

#: U+0B5D, the forbidden precomposed RHA.
PRECOMPOSED_DDHA_NUKTA = "\u0b5d"

#: The Odia block, used to tell Odia text from Latin and everything else.
ODIA_BLOCK_START = 0x0B00
ODIA_BLOCK_END = 0x0B7F


# --------------------------------------------------------------------- #
# canonical / is_canonical
# --------------------------------------------------------------------- #


def canonical(s: str) -> str:
    """
    Put a string into the project's canonical form: NFC, then an explicit
    rewrite of any surviving precomposed nukta character.

    The rewrite is belt and braces. NFC alone should already have decomposed
    U+0B5C and U+0B5D, but "should already" is exactly the assumption that
    produces a lexicon which stops matching six months later.
    """
    if not s:
        return s

    out = unicodedata.normalize("NFC", s)

    # Cheap guard: the vast majority of strings contain neither character.
    if PRECOMPOSED_DDA_NUKTA in out:
        out = out.replace(PRECOMPOSED_DDA_NUKTA, DDA_NUKTA)
    if PRECOMPOSED_DDHA_NUKTA in out:
        out = out.replace(PRECOMPOSED_DDHA_NUKTA, DDHA_NUKTA)

    return out


def is_canonical(s: str) -> bool:
    """
    True when `s` is already in canonical form, i.e. ``canonical(s) == s``.

    Implemented independently of `canonical()` rather than by calling it, so
    that the two can be cross-checked against each other in the self-test.
    """
    if PRECOMPOSED_DDA_NUKTA in s:
        return False
    if PRECOMPOSED_DDHA_NUKTA in s:
        return False
    return unicodedata.normalize("NFC", s) == s


def count_precomposed_nukta(s: str) -> tuple[int, int]:
    """Occurrences of (U+0B5C, U+0B5D) in `s`. Used by the build-time audit."""
    return s.count(PRECOMPOSED_DDA_NUKTA), s.count(PRECOMPOSED_DDHA_NUKTA)


# --------------------------------------------------------------------- #
# Inspection
# --------------------------------------------------------------------- #


def codepoints(s: str) -> str:
    """Render a string as space-separated code points, e.g. "U+0B21 U+0B3C"."""
    return " ".join("U+%04X" % ord(ch) for ch in s)


def is_odia_char(ch: str) -> bool:
    """True for any character in the Odia Unicode block."""
    return ODIA_BLOCK_START <= ord(ch) <= ODIA_BLOCK_END


# --------------------------------------------------------------------- #
# Self-test — the same vectors as core/test/normalize.test.ts
# --------------------------------------------------------------------- #


def _self_test() -> None:
    """
    Mirrors core/test/normalize.test.ts vector for vector.

        RRA canonical      U+0B21 U+0B3C        precomposed  U+0B5C
        RHA canonical      U+0B22 U+0B3C        precomposed  U+0B5D
    """
    precomposed_rra = "\u0b5c"
    precomposed_rha = "\u0b5d"
    canonical_rra = "\u0b21\u0b3c"
    canonical_rha = "\u0b22\u0b3c"
    yya = "\u0b5f"  # U+0B5F ODIA LETTER YYA. Atomic, must survive untouched.

    # "Odisha", spelled the wrong way and the right way.
    odisha_precomposed = "\u0b13" + precomposed_rra + "\u0b3f\u0b36\u0b3e"
    odisha_canonical = "\u0b13" + canonical_rra + "\u0b3f\u0b36\u0b3e"
    # "Odia", the language name, also containing RRA.
    odia_precomposed = "\u0b13" + precomposed_rra + "\u0b3f\u0b06"
    odia_canonical = "\u0b13" + canonical_rra + "\u0b3f\u0b06"

    fixtures = [
        "",
        " ",
        "odisha",
        "PCR",
        precomposed_rra,
        precomposed_rha,
        canonical_rra,
        canonical_rha,
        yya,
        odisha_precomposed,
        odisha_canonical,
        odia_precomposed,
        odia_canonical,
        "\u0b15\u0b47\u0b2e\u0b3f\u0b24\u0b3f",  # kemiti
        "\u0b05\u0b1b",  # achha
        "\u0b15\u0b4d\u0b37",  # ka + virama + ssa, a conjunct
        "\u0b38\u0b02\u0b16\u0b4d" + yya + "\u0b3e",  # sankhya
        "\u0b15\u0b47\u0b3e",  # ka + decomposed O matra
        "\u0b15\u0b4b",  # ka + composed O matra
        "\u0b15\u0b47\u0b56",  # ka + decomposed AI matra
        "\u0b15\u0b47\u0b57",  # ka + decomposed AU matra
        "\u0b15\u0b2e\u0b32\u0b4d",  # kamal with a trailing halanta
        "PCR " + odia_canonical + " Bayesian 42",
        "\U0001f600",  # astral, to prove nothing indexes by UTF-16 unit
    ]

    # -- the nukta invariant -------------------------------------------- #
    assert canonical(precomposed_rra) == "\u0b21\u0b3c"
    assert canonical(precomposed_rha) == "\u0b22\u0b3c"
    assert DDA_NUKTA == "\u0b21\u0b3c"
    assert DDHA_NUKTA == "\u0b22\u0b3c"
    assert NUKTA == "\u0b3c"
    assert VIRAMA == "\u0b4d"

    # NFC must not put the precomposed form back together.
    assert canonical(canonical_rra) == canonical_rra
    assert canonical(canonical_rha) == canonical_rha

    # The case that actually bites.
    assert canonical(odisha_precomposed) == odisha_canonical
    assert "\u0b3c" in canonical(odisha_precomposed)
    assert "\u0b5c" not in canonical(odisha_precomposed)
    assert canonical(odia_precomposed) == odia_canonical

    # YYA is atomic.
    assert canonical(yya) == yya
    assert canonical("\u0b16\u0b4d" + yya + "\u0b3e") == "\u0b16\u0b4d" + yya + "\u0b3e"

    for fixture in fixtures:
        out = canonical(fixture)
        assert "\u0b5c" not in out, f"U+0B5C survived in {codepoints(fixture)}"
        assert "\u0b5d" not in out, f"U+0B5D survived in {codepoints(fixture)}"

    assert canonical("") == ""
    assert canonical("kemiti achha") == "kemiti achha"

    # -- vowel-sign composition (the opposite direction) ----------------- #
    assert canonical("\u0b47\u0b3e") == "\u0b4b"
    assert canonical("\u0b47\u0b56") == "\u0b48"
    assert canonical("\u0b47\u0b57") == "\u0b4c"
    assert canonical("\u0b15\u0b47\u0b3e") == "\u0b15\u0b4b"

    for fixture in fixtures:
        out = canonical(fixture)
        for seq in ("\u0b47\u0b3e", "\u0b47\u0b56", "\u0b47\u0b57"):
            assert seq not in out, f"{codepoints(seq)} survived in {codepoints(fixture)}"

    # -- idempotence ------------------------------------------------------ #
    for fixture in fixtures:
        once = canonical(fixture)
        assert canonical(once) == once, f"not idempotent for {codepoints(fixture)}"
        # Something downstream will apply NFC to our output sooner or later.
        assert unicodedata.normalize("NFC", once) == once, (
            f"NFC changed output for {codepoints(fixture)}"
        )

    # -- is_canonical agrees with canonical ------------------------------- #
    for fixture in fixtures:
        assert is_canonical(fixture) == (canonical(fixture) == fixture), (
            f"disagreement on {codepoints(fixture)}"
        )
        assert is_canonical(canonical(fixture))

    assert not is_canonical(precomposed_rra)
    assert not is_canonical(precomposed_rha)
    assert not is_canonical(odisha_precomposed)
    assert not is_canonical("\u0b15\u0b47\u0b3e")
    assert is_canonical(canonical_rra)
    assert is_canonical(odisha_canonical)
    assert is_canonical(yya)

    # -- codepoints -------------------------------------------------------- #
    assert codepoints(canonical_rra) == "U+0B21 U+0B3C"
    assert codepoints(canonical(precomposed_rra)) == "U+0B21 U+0B3C"
    assert codepoints(precomposed_rra) == "U+0B5C"
    assert codepoints("A") == "U+0041"
    assert codepoints("\U0001f600") == "U+1F600"
    assert codepoints("") == ""

    # -- the audit counter -------------------------------------------------- #
    assert count_precomposed_nukta(odisha_precomposed) == (1, 0)
    assert count_precomposed_nukta(precomposed_rha + precomposed_rha) == (0, 2)
    assert count_precomposed_nukta(odisha_canonical) == (0, 0)

    print(f"normalize_odia self-test passed ({len(fixtures)} fixtures)")
    print(f"  unicodedata version : {unicodedata.unidata_version}")
    print(f"  RRA canonical {codepoints(DDA_NUKTA):>14}   forbidden {codepoints(PRECOMPOSED_DDA_NUKTA)}")
    print(f"  RHA canonical {codepoints(DDHA_NUKTA):>14}   forbidden {codepoints(PRECOMPOSED_DDHA_NUKTA)}")


if __name__ == "__main__":
    _self_test()
