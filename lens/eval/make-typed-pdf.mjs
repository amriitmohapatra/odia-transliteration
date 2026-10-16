// Makes lens/test/fixtures/typed-odia.pdf (see lens/test/fixtures/README.md):
//   node lens/eval/make-typed-pdf.mjs <out.pdf> <Noto Sans Oriya .ttf>
import { createRequire } from 'node:module';
const requireR = createRequire(process.cwd() + '/');
globalThis.regeneratorRuntime = requireR('regenerator-runtime'); // fontkit's Indic shaper needs it
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync, writeFileSync } from 'node:fs';
const W = ['\u0b38\u0b30\u0b15\u0b3e\u0b30', '\u0b30\u0b3e\u0b1c\u0b4d\u0b5f', '\u0b26\u0b3f\u0b28\u0b30\u0b47', '\u0b13\u0b21\u0b3c\u0b3f\u0b36\u0b3e', '\u0b2a\u0b4d\u0b30\u0b2c\u0b47\u0b36\u0b15\u0b41', '\u0b28\u0b47\u0b07', '\u0b32\u0b4b\u0b15', '\u0b2a\u0b3e\u0b07\u0b01'];
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(readFileSync(process.argv[3]), { subset: true });
const page = doc.addPage([600, 400]);
for (let i = 0; i < 4; i++) page.drawText(W.join(' '), { x: 30, y: 350 - i * 40, size: 18, font });
writeFileSync(process.argv[2], await doc.save());
