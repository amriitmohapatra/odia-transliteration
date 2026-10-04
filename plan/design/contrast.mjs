const hex = h => { h=h.replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
const lin = c => { c/=255; return c<=0.03928? c/12.92 : ((c+0.055)/1.055)**2.4; };
const L = rgb => 0.2126*lin(rgb[0])+0.7152*lin(rgb[1])+0.0722*lin(rgb[2]);
const mix = (fg,bg,a) => fg.map((v,i)=>Math.round(v*a+bg[i]*(1-a)));
const ratio = (a,b) => { const x=L(a), y=L(b); return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)); };
const r = (name, fg, bg, alpha=1, need=4.5) => { const B=hex(bg); const F= alpha<1? mix(hex(fg),B,alpha): hex(fg); const v=ratio(F,B); console.log(`${v>=need?'PASS':'FAIL'} ${v.toFixed(2).padStart(6)}  need ${need}  ${name}`); };
const set = process.argv[2];
if (set==='current') {
console.log('--- CURRENT light');
r('text on bg','#1b1b21','#f7f6fa'); r('muted on bg','#63636f','#f7f6fa'); r('muted on surface-soft (output placeholder)','#63636f','#f1eff7');
r('muted on panel (bar latin word, gloss)','#63636f','#ffffff'); r('accent on bg (links/summary)','#5b2a9a','#f7f6fa');
r('accent-text on accent (Copy, active cand.)','#ffffff','#5b2a9a'); r('active gloss (.85 alpha) on accent','#ffffff','#5b2a9a',0.85);
r('toast: accent-text on ok','#ffffff','#0a7050'); r('toast error: white on warn','#ffffff','#8a4a00');
r('palette-name text@0.55 on bg','#1b1b21','#f7f6fa',0.55); r('mode-hint text@0.7 on bg','#1b1b21','#f7f6fa',0.7);
r('inline-num text@0.65 on panel','#1b1b21','#ffffff',0.65); r('gloss-none dot muted@0.35 on panel','#63636f','#ffffff',0.35);
r('line border vs surface (input edge, non-text)','#dedbe8','#ffffff',1,3); r('line vs bg (palette key edge)','#dedbe8','#f7f6fa',1,3);
r('ambiguous dotted underline accent vs surface-soft','#5b2a9a','#f1eff7',1,3);
console.log('--- CURRENT dark');
r('text on bg','#ecebf2','#131318'); r('muted on bg','#9b9aa9','#131318'); r('muted on panel','#9b9aa9','#272733');
r('accent on bg','#c3a4f4','#131318'); r('accent-text on accent','#1a1024','#c3a4f4'); r('toast: accent-text on ok','#1a1024','#59d5a0');
r('HOVER BUG: accent-text on panel+10% white (active cand. under pointer)','#1a1024', '#'+mix([255,255,255],hex('#272733'),0.10).map(v=>v.toString(16).padStart(2,'0')).join(''));
r('inline-num text@0.65 on panel','#ecebf2','#272733',0.65); r('palette-name text@0.55 on bg','#ecebf2','#131318',0.55);
r('line vs surface (non-text)','#32323e','#1c1c23',1,3); r('line vs panel','#32323e','#272733',1,3);
}
if (set==='proposed') {
console.log('--- PROPOSED light');
r('text on bg','#17171c','#f7f6fa'); r('muted on bg','#55555f','#f7f6fa',1,4.5); r('muted on surface-soft','#55555f','#f1eff7'); r('muted on panel','#55555f','#ffffff');
r('accent on bg','#5b2a9a','#f7f6fa'); r('accent-text on accent','#ffffff','#5b2a9a'); r('accent on accent-soft (chosen word, chip)','#5b2a9a','#ece3fb');
r('line-strong vs surface (control edge)','#8a879a','#ffffff',1,3); r('line-strong vs bg','#8a879a','#f7f6fa',1,3);
r('ok on bg (offline-ready text)','#0a6b4c','#f7f6fa'); r('accent-text on ok (toast)','#ffffff','#0a6b4c');
r('warn on warn-soft (rude badge)','#7a4100','#fbefdc'); r('danger on danger-soft (offensive badge)','#a0172c','#fbe4e7');
r('danger-text on danger (block banner)','#ffffff','#a0172c');
console.log('--- PROPOSED dark');
r('text on bg','#ecebf2','#131318'); r('muted on bg','#a9a8b6','#131318'); r('muted on panel','#a9a8b6','#272733'); r('muted on surface','#a9a8b6','#1c1c23');
r('accent on bg','#c3a4f4','#131318'); r('accent on panel','#c3a4f4','#272733'); r('accent-text on accent','#1a1024','#c3a4f4'); r('accent on accent-soft','#c3a4f4','#2a2138');
r('hover fixed: hover = accent-soft, text','#ecebf2','#2a2138');
r('line-strong vs surface','#76758a','#1c1c23',1,3); r('line-strong vs panel','#7d7c90','#272733',1,3);
r('ok on bg','#59d5a0','#131318'); r('accent-text on ok','#1a1024','#59d5a0');
r('warn on warn-soft','#f0bd78','#3a2a14'); r('danger on danger-soft','#ff9aa5','#3d1a20'); r('danger-text on danger','#1a1024','#ff9aa5');
}
