import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const outputDir = process.argv[3] || '/tmp/odia-browser-review';
fs.mkdirSync(outputDir, {recursive:true});
import fs from 'node:fs';
const b = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {});
const cases = [
 ['greeting','namaskar tume kemiti achha'],
 ['pronoun','mu bhala achhi'],
 ['pronoun-variant','mun bhala achhi'],
 ['question','tume kana karucha'],
 ['food','mu bhata khai sarili'],
 ['travel','mu aji ghara jauchi'],
 ['friend','kali mo sanga asiba'],
 ['phone','mote phone kara'],
 ['work','aji office re meeting achhi'],
 ['message','mote message pathao'],
 ['video','mu video dekhuchi'],
 ['loan-phonetic','mo mobail re internet chaluni'],
 ['mixed','WhatsApp re photo pathao'],
 ['user-recording','namaskar mun heuchi eka nua app odia bhasa lekhiba pain']
];
const records=[];
for(const [id,input] of cases){
 const ctx=await b.newContext({viewport:{width:1440,height:1000}});
 await ctx.addInitScript(()=>localStorage.setItem('odia.pref.seenIntro','1'));
 const p=await ctx.newPage(); const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:${process.argv[2] || '4810'}/`);
 await p.waitForTimeout(2200);
 const ta=p.locator('textarea').first(); await ta.click();
 const tokens=[];
 for(const token of input.split(' ')){
  await p.keyboard.type(token,{delay:12}); await p.waitForTimeout(180);
  tokens.push({input:token,candidates:await p.locator('div.inline-candidates button').evaluateAll(bs=>bs.map(x=>({text:x.querySelector('.inline-text')?.textContent??x.textContent,gloss:x.querySelector('.dict-gloss')?.textContent??'',label:x.getAttribute('aria-label')})))});
  await p.keyboard.press('Space');
 }
 await p.waitForTimeout(250);
 records.push({id,input,output:await ta.inputValue(),readback:await p.locator('#readback').innerText(),tokens,errors});
 console.log(JSON.stringify(records.at(-1)));
 if(['food','work'].includes(id))await p.screenshot({path:path.join(outputDir, `baseline-${id}.png`),fullPage:true});
 await ctx.close();
}
fs.writeFileSync(path.join(outputDir, 'browser-audit.json'),JSON.stringify(records,null,2));
await b.close();
