// The voice helper "Talk" (V3.6, src/agent.ts and src/agent-tools.ts) against a
// stand-in for the ElevenLabs SDK (globalThis.__ODIA_TALK_SDK__) and for /api/voice
// and /api/agent (Playwright routes; no ElevenLabs call, no key). Checks that
// nothing is sent while the switch is off, that a talk starts with the server's
// token and the five client tools, and that the tools edit the text box with
// canonical Odia. Build Appv2 and serve dist first. Usage: node talk-check.mjs [port]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = new URL(process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`).href;
const ODISHA = 'ଓଡ଼ିଶା';
const ODISHA_PRECOMPOSED = 'ଓଡ଼ିଶା';
const GHARA = 'ଘର';

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('PASS', message); };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(['microphone'], { origin: new URL(url).origin });
  await context.addInitScript(() => {
    localStorage.setItem('odia.pref.seenIntro', '1');
    // Stand-in for @elevenlabs/client: records the options and ends on request.
    window.__talkLog = { started: 0, ended: 0, options: null };
    window.__ODIA_TALK_SDK__ = {
      Conversation: {
        startSession: async (options) => {
          window.__talkLog.started++;
          window.__talkLog.options = options;
          setTimeout(() => options.onModeChange?.({ mode: 'listening' }), 10);
          return { endSession: async () => { window.__talkLog.ended++; options.onDisconnect?.({ reason: 'user' }); } };
        },
      },
    };
  });
  const page = await context.newPage();
  const errors = []; const external = []; const agentCalls = []; const voiceCalls = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await page.route('**/api/voice', async (route) => {
    voiceCalls.push(1);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ speech: 'elevenlabs', agent: true }) });
  });
  await page.route('**/api/agent', async (route) => {
    agentCalls.push(route.request().method());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, token: 'stand-in-token' }) });
  });
  await page.goto(url);
  await page.locator('#roman').waitFor();

  // Switch off (the default): no Talk button, nothing asked or sent.
  check(await page.locator('#talk').isHidden(), 'Talk is hidden while Voice helper is off');
  check(voiceCalls.length === 0 && agentCalls.length === 0, 'with the switch off, nothing is sent');

  // Switch on: the button shows and the line under the page names ElevenLabs.
  await page.locator('#open-settings').click();
  await page.locator('#toggle-talk-online').check();
  await page.locator('#settings .picker-panel [data-settings-close]').click();
  check(await page.evaluate(() => localStorage.getItem('odia.pref.talkOnline')) === '1', 'the Voice helper switch is remembered');
  check(await page.locator('#talk').isVisible(), 'turning Voice helper on shows Talk');
  check((await page.locator('#privacy-note').innerText()).includes('Talk sends your voice'), 'the line under the page says what Talk sends, and to whom');
  check(agentCalls.length === 0, 'turning the switch on starts nothing');

  // Talk: one token request, then the SDK with the token and the five tools.
  await page.locator('#roman').fill(`${GHARA} `);
  await page.locator('#talk').click();
  await page.waitForFunction(() => document.getElementById('talk-label')?.textContent === 'End talk');
  check(agentCalls.length === 1 && agentCalls[0] === 'POST', 'Talk asks /api/agent for a token once, by POST');
  const opts = await page.evaluate(() => ({ token: window.__talkLog.options.conversationToken, type: window.__talkLog.options.connectionType, tools: Object.keys(window.__talkLog.options.clientTools).sort() }));
  check(opts.token === 'stand-in-token' && opts.type === 'webrtc', 'the conversation starts over WebRTC with the server\'s token');
  check(JSON.stringify(opts.tools) === JSON.stringify(['look_up', 'read_text', 'replace_text', 'spell', 'type_odia']), 'the five client tools are given to the agent');
  check((await page.locator('#status').innerText()).includes('listening'), 'the line under the box says the helper is listening');

  // The tools, called as the agent would.
  const tool = (name, params) => page.evaluate(([n, p]) => window.__talkLog.options.clientTools[n](p), [name, params]);
  check(await tool('type_odia', { text: ODISHA_PRECOMPOSED }) === 'Typed.', 'type_odia answers "Typed."');
  const typed = await page.locator('#roman').inputValue();
  check(typed.includes(ODISHA) && !typed.includes('ଡ଼'), 'the typed Odia lands in the box with the nukta decomposed');
  check((await tool('read_text', {})).includes(ODISHA), 'read_text gives the agent the box');
  check(await tool('replace_text', { find: GHARA, replace: ODISHA }) === 'Replaced.', 'replace_text fixes a word');
  check(!(await page.locator('#roman').inputValue()).includes(GHARA), 'the replaced word is gone from the box');
  check((await tool('spell', { roman: 'odisha' })).includes(ODISHA), 'spell gives the engine\'s Odia for a roman word');
  check(!(await tool('look_up', { word: ODISHA })).startsWith('Give'), 'look_up answers from the app\'s dictionary');
  check((await tool('type_odia', { text: 'hello' })).startsWith('Not typed'), 'type_odia refuses text that is not Odia');

  // An agent line shows under the box; End talk ends the session.
  await page.evaluate((t) => window.__talkLog.options.onMessage({ message: t, role: 'agent' }), ODISHA);
  check((await page.locator('#status').innerText()).includes(`Helper: ${ODISHA}`), 'the helper\'s words show under the box');
  await page.locator('#talk').click();
  await page.waitForFunction(() => document.getElementById('talk-label')?.textContent === 'Talk');
  check(await page.evaluate(() => window.__talkLog.ended) === 1, 'End talk ends the session');

  // Turning the switch off during a talk ends it and hides the button.
  await page.locator('#talk').click();
  await page.waitForFunction(() => document.getElementById('talk-label')?.textContent === 'End talk');
  await page.locator('#open-settings').click();
  await page.locator('#toggle-talk-online').uncheck();
  await page.locator('#settings .picker-panel [data-settings-close]').click();
  await page.waitForFunction(() => window.__talkLog.ended === 2);
  check(await page.locator('#talk').isHidden(), 'turning Voice helper off ends the talk and hides Talk');

  // A refused token: the user gets the server's message.
  await page.unroute('**/api/agent');
  await page.route('**/api/agent', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Talk is not set up on the server yet.' }) }));
  await page.locator('#open-settings').click();
  await page.locator('#toggle-talk-online').check();
  await page.locator('#settings .picker-panel [data-settings-close]').click();
  await page.locator('#talk').click();
  await page.waitForFunction(() => document.getElementById('status')?.textContent.includes('not set up'));
  check(await page.evaluate(() => window.__talkLog.started) === 2, 'without a token the SDK is not started');

  check(external.length === 0, `no request leaves the site (${external.join(', ')})`);
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  await context.close();
} finally {
  await browser.close();
}
console.log(`\n${checks} talk checks passed`);
