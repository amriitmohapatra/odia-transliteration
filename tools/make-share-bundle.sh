#!/bin/bash
# Assemble a folder to send to testers, and zip it.
#
# Everything here is generated from the repo, so rerun it after any change
# rather than editing the bundle by hand.
#
#   ./tools/make-share-bundle.sh
#
# Produces  share/Odia Phonetic (preview).zip

set -euo pipefail
cd "$(dirname "$0")/.."

STAMP="$(date +%Y-%m-%d)"
NAME="Odia Phonetic (preview)"
OUT="share/${NAME}"

echo "==> Rebuilding both apps so the bundle cannot ship something stale"
npm run build:app        >/dev/null 2>&1
npm run build:app:legacy >/dev/null 2>&1

if [[ ! -f docs/romanization-reference.pdf ]]; then
    echo "    error: docs/romanization-reference.pdf is missing" >&2
    echo "    build it with: cd docs && lualatex romanization-reference.tex" >&2
    exit 1
fi

echo "==> Assembling ${OUT}"
rm -rf "share"
mkdir -p "${OUT}"

cp docs/odia-app.html              "${OUT}/Odia Phonetic.html"
cp docs/odia-app-legacy.html       "${OUT}/Odia Phonetic (older Macs).html"
cp docs/romanization-reference.pdf "${OUT}/Typing Guide.pdf"

# --- the page a tester opens first -----------------------------------------
cat > "${OUT}/START HERE.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Odia Phonetic — start here</title>
<style>
  :root { --fg:#1a1a1a; --muted:#5b5b66; --line:#e2e0e8; --accent:#5b2a9a; --panel:#f7f6fa; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#eceff4; --muted:#9aa0aa; --line:#33343b; --accent:#c9a3ff; --panel:#1f1f26; }
    body { background:#16161a; }
  }
  body { max-width: 44rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem;
         font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         color: var(--fg); }
  h1 { font-size: 1.6rem; color: var(--accent); margin-bottom: .2rem; }
  h2 { font-size: 1.05rem; margin-top: 2.2rem; color: var(--accent); }
  .sub { color: var(--muted); margin-top: 0; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
          padding: 1rem 1.15rem; margin: 1.2rem 0; }
  a.big { display:inline-block; background: var(--accent); color:#fff; text-decoration:none;
          padding: .7rem 1.2rem; border-radius: 10px; font-weight:600; }
  code { background: var(--panel); border:1px solid var(--line); border-radius:4px;
         padding: 1px 5px; font-size: .92em; }
  .odia { font-family:"Noto Sans Oriya","Oriya Sangam MN",sans-serif; font-size:1.25em; }
  table { border-collapse: collapse; width:100%; margin:.6rem 0 1rem; }
  td,th { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); font-size:.94rem; }
  th { color: var(--muted); font-weight:600; font-size:.8rem; text-transform:uppercase;
       letter-spacing:.04em; }
  .muted { color: var(--muted); font-size:.9rem; }
  ul { padding-left: 1.15rem; }
  li { margin: .35rem 0; }
</style>
</head>
<body>

<h1>Odia Phonetic</h1>
<p class="sub">Type Odia the way it sounds. Preview build, ${STAMP}.</p>

<p><a class="big" href="./Odia Phonetic.html">Open the app</a></p>

<div class="card">
  <strong>If that shows an error instead of loading</strong> &mdash; anything like
  <em>&ldquo;Engine failed to load&rdquo;</em> &mdash; your Mac has an older Safari.
  Use <a href="./Odia Phonetic (older Macs).html">Odia Phonetic (older Macs).html</a>
  instead. It is the same app, built to run on macOS Big Sur and earlier. Everything
  below applies to both.
</div>

<div class="card">
  <strong>Everything runs on your own device.</strong> Nothing is uploaded, and the app
  makes no network calls at all — you can turn Wi-Fi off and it still works. It is a
  single file, so there is nothing to install.
</div>

<h2>How to use it</h2>
<p>Type phonetically in the top box. As you type, a numbered list of options appears next
to the cursor — press <code>1</code>&ndash;<code>9</code> to pick one, or just press space
to take the first. Your choices are remembered, so a word you have corrected once comes
up first next time.</p>

<table>
  <tr><th>You type</th><th>You get</th></tr>
  <tr><td><code>kemiti achha</code></td><td class="odia">କେମିତି ଅଛ</td></tr>
  <tr><td><code>janmadina</code></td><td class="odia">ଜନ୍ମଦିନ</td></tr>
  <tr><td><code>baabunka</code></td><td class="odia">ବାବୁଙ୍କ</td></tr>
  <tr><td><code>shri krushna</code></td><td class="odia">ଶ୍ରୀ କୃଷ୍ଣ</td></tr>
</table>

<p><strong>Typing Guide.pdf</strong> in this folder lists every letter, matra and conjunct,
and the two things most likely to trip you up.</p>

<h2>On a Mac</h2>
<p>Double-click <code>Odia Phonetic.html</code>. To keep it handy, open it in Safari and
use <strong>File &rarr; Add to Dock</strong> — it then opens in its own window.</p>

<div class="card">
  <strong>Needs a reasonably current browser.</strong> Safari 13+, Chrome 80+, Edge 80+ or
  Firefox 75+. If you see <em>"Engine failed to load"</em>, the browser is older than that
  &mdash; check <strong>Safari &rarr; About Safari</strong>. Chrome or Firefox on the same
  machine is a quick workaround.
</div>

<h2>On an iPhone or iPad</h2>
<p>AirDrop <code>Odia Phonetic.html</code> to the device, open it in Safari, then
<strong>Share &rarr; Add to Home Screen</strong>. <span class="muted">Honest note: this
has not yet been tested on a real iPhone, so if you try it, that feedback is especially
useful.</span></p>

<h2>What would help most</h2>
<p>The romanization scheme is a <strong>draft that no native speaker has reviewed yet</strong>.
Every mapping is a proposal. The most valuable thing you can do is write real sentences —
the kind you would actually send someone — and note anything that comes out wrong.</p>
<ul>
  <li>The word you typed, exactly as you typed it</li>
  <li>What appeared</li>
  <li>What it should have been</li>
  <li>Whether the right answer was somewhere in the numbered list, just not first</li>
</ul>
<p class="muted">That last point matters a lot: "wrong but present at number 3" is a
ranking problem, while "not in the list at all" is a missing rule. They get fixed very
differently.</p>

<h2>Known rough edges</h2>
<ul>
  <li>It cannot type directly into other apps yet. Compose here, then copy and paste.</li>
  <li>Long vowels usually need doubling &mdash; <code>bhaagya</code> for
      <span class="odia">ଭାଗ୍ୟ</span>. Common words are recognised either way.</li>
  <li>Proper nouns and rare words are the weakest area, which is where the numbered
      list earns its keep.</li>
  <li>Not yet tested on iOS hardware.</li>
</ul>

</body>
</html>
HTML

# --- a short plain-text note, for anyone who unzips and reads the folder -----
cat > "${OUT}/README.txt" <<TXT
Odia Phonetic — preview build (${STAMP})
========================================

Open "START HERE.html" first.

  Odia Phonetic.html               the app. Double-click it. Works offline.
  Odia Phonetic (older Macs).html  use this one if the above shows
                                   "Engine failed to load". Same app, built for
                                   macOS Big Sur and earlier.
  Typing Guide.pdf                 every letter, matra and conjunct.
  START HERE.html                  how to use it, and what feedback helps most.

The romanization scheme is a DRAFT and has not been reviewed by a native Odia
speaker. Treat every mapping as a proposal. Real sentences are the most useful
kind of feedback — especially any word where the correct spelling was not in the
numbered list at all.
TXT

echo "==> Zipping"
cd share
zip -q -r -X "${NAME}.zip" "${NAME}"
cd ..

echo ""
echo "    ${OUT}/"
ls -1 "${OUT}" | sed 's/^/      /'
echo ""
printf "    zip: %s  (%s)\n" "share/${NAME}.zip" "$(du -h "share/${NAME}.zip" | cut -f1)"
