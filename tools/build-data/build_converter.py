"""Build core/data/converter.bin: Desh's Latin -> Odia spelling converter in a compact binary.

Source: the Desh Odia keyboard's transliteration model, a joint n-gram weighted FST, exported
with OpenFst `fstprint` (`arcs_fstprint.tsv.gz`). Shared with the owner on 2026-10-12. The raw
file is NOT in this repository; pass its path. See core/data/PROVENANCE.md (section "Desh").

    python3 -I tools/build-data/build_converter.py /path/to/arcs_fstprint.tsv.gz [OUT] [--scale N]

Standard library only. The decoder is core/src/converter.ts; keep the two in step.
The file written is the binary below, gzip-compressed (-9, mtime 0); inflate it first.

Input rows (tab-separated): `src dst in out [weight]` arcs, or `state [weight]` final states.
`<eps>` is epsilon; the input symbol `_` is also treated as epsilon; output `_` is empty.
Multi-character tokens are joined with `|` (`a|i` = the letters "ai"); output pieces are
concatenated. Weights are tropical costs (lower is better). Start state is 0.

Binary format, version 1. All integers little-endian. "varint" is unsigned LEB128;
"zigzag" maps a signed delta d to 2d (d >= 0) or -2d-1 (d < 0) before the varint.
"Planes" store n integers of w bytes as w runs of n bytes (all low bytes first).

    header (34 bytes)
      4   magic "OCNV"
      u16 version (1)              u16 flags (0)
      u32 nStates                  u32 nArcs
      u32 startState               u32 weightScale   (cost = stored integer / weightScale)
      u16 nIn    input tokens; id 0 = epsilon, no text stored for it
      u16 nOut   output strings; id 0 = the empty string
      u16 nPairs label pairs; pair 0 = (0, 0), not stored
      u32 nFinals
    input tokens   ids 1..nIn-1: u8 length, then ASCII bytes
    output strings ids 0..nOut-1: u8 length in UTF-16 code units, then u16 code units
    arc counts     nStates varints (arcs leaving each state), then nStates varints (how
                   many of them are epsilon-input arcs; those come first in the state)
    label pairs    pairs 1..nPairs-1: varint input id, varint output id
    state labels   nStates x u16 planes: the pair on every non-epsilon arc entering the
                   state (0 if none). In a joint n-gram FST the label of such an arc is a
                   function of its destination (the state's last joint token), so arcs
                   carry no labels of their own; the builder refuses an FST without this.
    eps outputs    varint count, then (varint index delta among epsilon arcs, varint
                   output id) for each epsilon-input arc with a non-empty output
    weight, eps    epsilon arcs in arc order: u16 planes (quantised cost)
    weight, other  non-epsilon arcs in arc order: u16 planes
    dst, eps       zigzag varints: dst minus the previous epsilon arc's dst (first: minus 0)
    dst, other     zigzag varints: dst minus the previous non-epsilon arc's dst
    finals         nFinals varints (state minus the previous final state, first minus 0),
                   then nFinals x u16 planes (quantised final cost)

Arcs keep the order of the fstprint export inside each state. Input ids follow the order the
export uses (recovered by a topological sort of the per-state label sequences), so arcs are
sorted by input id inside every state and the decoder can binary-search a token (it checks
this on load). In that order the export numbers new states consecutively, which is why the
dst deltas are small. Splitting epsilon (back-off) arcs from the others roughly halves the
compressed size of dst and trims the weights.

Weights are quantised to integers: round(w * scale), clamped to 65535 (two sentinel arcs
weigh 99.0). The scale is a command-line option; its effect on n-best order was measured
against the float decoder before choosing the default (see DEFAULT_SCALE).
Output strings are canonicalised by the decoder (NFC, then U+0B5C/U+0B5D decomposed), not
here: the export emits pieces of syllables, and canonical form is a property of the word.
"""

from __future__ import annotations

import collections
import graphlib
import gzip
import hashlib
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "core" / "data" / "converter.bin"

MAGIC = b"OCNV"
VERSION = 1
# Measured 2026-10-12 on the 4,201 held-out keys (top-5, reference decoder, float vs
# quantised weights): held-out accuracy is unchanged at 1/512, 1/256, 1/128 and 1/64; top-1
# is identical for 99.95% of keys at 1/256 (99.79% at 1/128), the ordered top-5 for 98.9%
# (96.6% at 1/128). 1/256 costs ~50 KB gzipped over 1/128.
DEFAULT_SCALE = 256
U16_MAX = 65535
EPSILON_INPUTS = {"<eps>", "_"}
EMPTY_OUTPUTS = {"<eps>", "_"}

USAGE = "usage: python3 -I build_converter.py ARCS_FSTPRINT.tsv.gz [OUT] [--scale N]"


def varint(n: int, out: bytearray) -> None:
    if n < 0:
        raise ValueError(f"negative varint {n}")
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def zigzag(d: int) -> int:
    return d << 1 if d >= 0 else ((-d) << 1) - 1


def planes(values: list[int], width: int) -> bytes:
    """Little-endian integers of `width` bytes, stored plane by plane (all byte 0s first)."""
    out = bytearray()
    for k in range(width):
        shift = 8 * k
        out += bytes((v >> shift) & 0xFF for v in values)
    return bytes(out)


def input_order(rows: list[tuple[int, int, str, str, int]]) -> list[str]:
    """Input tokens in the order the export sorts them inside a state (epsilon first)."""
    ts: graphlib.TopologicalSorter[str] = graphlib.TopologicalSorter()
    ts.add("")
    prev: tuple[int, str] | None = None
    for s, _d, i, _o, _w in rows:
        if prev is not None and prev[0] == s and prev[1] != i:
            ts.add(i, prev[1])
        else:
            ts.add(i)
        prev = (s, i)
    try:
        order = list(ts.static_order())
    except graphlib.CycleError:
        order = sorted({r[2] for r in rows} | {""})
    order.remove("")
    return [""] + order


def main() -> None:
    args = sys.argv[1:]
    scale = DEFAULT_SCALE
    if "--scale" in args:
        k = args.index("--scale")
        scale = int(args[k + 1])
        del args[k : k + 2]
    if not args:
        sys.exit(USAGE)
    src = Path(args[0])
    out_path = Path(args[1]) if len(args) > 1 else OUT

    def quantise(w: float) -> int:
        if w < 0:
            raise ValueError(f"negative cost {w}: the decoder assumes tropical costs >= 0")
        return min(U16_MAX, round(w * scale))

    rows: list[tuple[int, int, str, str, int]] = []  # src, dst, input, output, weight
    finals: dict[int, int] = {}
    max_state = 0
    with gzip.open(src, "rt", encoding="utf8") as f:
        for line_no, line in enumerate(f, 1):
            p = line.rstrip("\n").split("\t")
            if p == [""]:
                continue
            if len(p) <= 2:
                s = int(p[0])
                finals[s] = quantise(float(p[1]) if len(p) == 2 else 0.0)
                max_state = max(max_state, s)
                continue
            if len(p) > 5:
                raise ValueError(f"line {line_no}: {len(p)} columns")
            s, d = int(p[0]), int(p[1])
            i = "" if p[2] in EPSILON_INPUTS else p[2].replace("|", "")
            o = "" if p[3] in EMPTY_OUTPUTS else p[3].replace("|", "")
            if p[2] not in EPSILON_INPUTS and not i:
                raise ValueError(f"line {line_no}: empty input token {p[2]!r}")
            if not i.isascii() or i != i.lower() or len(i) > 255:
                raise ValueError(f"line {line_no}: input token {p[2]!r} is not short lower-case ASCII")
            w = quantise(float(p[4]) if len(p) == 5 else 0.0)
            rows.append((s, d, i, o, w))
            max_state = max(max_state, s, d)

    n_states = max_state + 1
    in_tokens = input_order(rows)
    in_id = {t: k for k, t in enumerate(in_tokens)}
    n_in = len(in_tokens)

    # Output ids: 0 = empty, then by descending frequency (small ids compress better).
    out_freq = collections.Counter(r[3] for r in rows if r[3])
    out_strings = [""] + sorted(out_freq, key=lambda s: (-out_freq[s], s))
    out_id = {s: k for k, s in enumerate(out_strings)}
    n_out = len(out_strings)
    if n_out > U16_MAX:
        raise ValueError("too many output strings for u16 ids")

    # Group by source state, keeping the export's order inside a state (stable sort).
    arcs = sorted(
        ((s, in_id[i], out_id[o], d, w) for s, d, i, o, w in rows),
        key=lambda a: (a[0], a[1]),
    )
    counts = [0] * n_states
    for a in arcs:
        counts[a[0]] += 1
    eps = [a for a in arcs if a[1] == 0]
    non = [a for a in arcs if a[1] != 0]
    eps_counts = [0] * n_states
    for a in eps:
        eps_counts[a[0]] += 1

    # In a joint n-gram FST every non-epsilon arc entering a state carries the same
    # (input, output) pair: the state's last joint token. Store that pair once per state.
    pairs: list[tuple[int, int]] = [(0, 0)]  # pair 0 = no incoming non-eps arc
    pair_id: dict[tuple[int, int], int] = {}
    state_in = [0] * n_states
    for a in non:
        pr = (a[1], a[2])
        if pr not in pair_id:
            pair_id[pr] = len(pairs)
            pairs.append(pr)
        k = pair_id[pr]
        if state_in[a[3]] not in (0, k):
            sys.exit(f"state {a[3]} is entered by arcs with different labels; "
                     "this format needs a joint n-gram FST (labels a function of the destination)")
        state_in[a[3]] = k
    if len(pairs) > U16_MAX:
        raise ValueError("too many label pairs for u16 ids")

    sections: dict[str, bytes] = {}
    head = bytearray(MAGIC)
    head += struct.pack(
        "<HHIIIIHHHI", VERSION, 0, n_states, len(arcs), 0, scale, n_in, n_out, len(pairs),
        len(finals),
    )
    for t in in_tokens[1:]:
        b = t.encode("ascii")
        head.append(len(b))
        head += b
    for s in out_strings:
        units = s.encode("utf-16-le")
        if len(units) // 2 > 255:
            raise ValueError("output string too long")
        head.append(len(units) // 2)
        head += units
    sections["header+tables"] = bytes(head)
    b = bytearray()
    for c in counts:
        varint(c, b)
    for c in eps_counts:
        varint(c, b)
    sections["arc counts"] = bytes(b)
    b = bytearray()
    for il, ol in pairs[1:]:
        varint(il, b)
        varint(ol, b)
    sections["label pairs"] = bytes(b)
    sections["state labels"] = planes(state_in, 2)
    # Back-off arcs output nothing; the few epsilon-input arcs that do output something
    # (input `_`) are listed sparsely: count, then (eps arc index delta, output id).
    b = bytearray()
    sparse = [(k, a[2]) for k, a in enumerate(eps) if a[2] != 0]
    varint(len(sparse), b)
    prev = 0
    for k, ol in sparse:
        varint(k - prev, b)
        varint(ol, b)
        prev = k
    sections["eps outputs"] = bytes(b)
    sections["weight eps"] = planes([a[4] for a in eps], 2)
    sections["weight other"] = planes([a[4] for a in non], 2)
    for name, group in (("dst eps", eps), ("dst other", non)):
        b = bytearray()
        prev = 0
        for a in group:
            varint(zigzag(a[3] - prev), b)
            prev = a[3]
        sections[name] = bytes(b)
    b = bytearray()
    prev = 0
    final_states = sorted(finals)
    for s in final_states:
        varint(s - prev, b)
        prev = s
    b += planes([finals[s] for s in final_states], 2)
    sections["finals"] = bytes(b)

    buf = b"".join(sections.values())
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gz = gzip.compress(buf, compresslevel=9, mtime=0)
    # The file is stored gzip-compressed (deterministic: mtime 0). The web app
    # inflates it with the vendored pako, like the dictionary payloads; node
    # (core/src/node.ts) with zlib. parseConverter() takes the inflated bytes.
    out_path.write_bytes(gz)
    print(f"states {n_states}  arcs {len(arcs)} (eps {len(eps)})  finals {len(finals)}  "
          f"input tokens {n_in - 1}  output strings {n_out - 1}  scale 1/{scale}")
    for name, sec in sections.items():
        print(f"  {name:14} raw {len(sec):>9,}  gzip {len(gzip.compress(sec, 9, mtime=0)):>9,}")
    print(f"wrote {out_path}  raw {len(buf):,} bytes  gzip -9 {len(gz):,} bytes")
    print(f"source sha256 {hashlib.sha256(src.read_bytes()).hexdigest()}")
    print(f"output sha256 {hashlib.sha256(buf).hexdigest()} (inflated), "
          f"{hashlib.sha256(gz).hexdigest()} (file)")


if __name__ == "__main__":
    main()
