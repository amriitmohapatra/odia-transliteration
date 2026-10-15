# Test fixtures

`typed-odia.pdf` (4.4 KB): a PDF of typed Odia for the PDF reader's typed-text path
(V4.7). Eight test words, four times, in Noto Sans Oriya (OFL 1.1, embedded as a subset,
see `web/src/fonts/OFL.txt`). Its text layer stores every letter but in drawing order
(the vowel sign e before its consonant), as many real PDFs do.

Made with `lens/eval/make-typed-pdf.mjs` (pdf-lib 1.17.1 and @pdf-lib/fontkit 1.1.1, MIT,
dev dependencies; fontkit's Indic shaper also needs `regenerator-runtime`, MIT, present
in `node_modules` through another package) from a TrueType copy of `web/src/fonts/noto-sans-oriya-oriya-400-normal.woff2`
(fontTools: `TTFont(woff2); flavor = None; save(ttf)`):

    node lens/eval/make-typed-pdf.mjs lens/test/fixtures/typed-odia.pdf noto-oriya.ttf
