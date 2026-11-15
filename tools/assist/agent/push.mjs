#!/usr/bin/env node
/**
 * Push the voice helper (tools/assist/agent/odia-helper.json) to ElevenLabs.
 * V3.6; plan/07-voice-agent.md.
 *
 *   ELEVENLABS_API_KEY=… node tools/assist/agent/push.mjs --dry-run   # print what would be sent
 *   ELEVENLABS_API_KEY=… node tools/assist/agent/push.mjs             # create the agent; prints its ID
 *   ELEVENLABS_API_KEY=… ELEVENLABS_AGENT_ID=agent_… node tools/assist/agent/push.mjs   # update it
 *
 * 1. Each client tool is created, or updated when a tool of that name exists.
 * 2. The agent gets those tool IDs and is created, or updated when ELEVENLABS_AGENT_ID is set.
 *
 * The file is the source of truth: a change made in the dashboard is undone by
 * the next push. Every Odia string must be canonical (nukta decomposed, CLAUDE.md).
 * API reference read 2026-11-13: /v1/convai/tools (GET, POST, PATCH /{id}),
 * /v1/convai/agents/create (POST), /v1/convai/agents/{id} (PATCH).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.elevenlabs.io';
const FILE = fileURLToPath(new URL('./odia-helper.json', import.meta.url));

/** core/src/normalize.ts canonical(), repeated here so the script has no build step. */
const canonical = (s) => s.normalize('NFC').replaceAll('ଡ଼', 'ଡ଼').replaceAll('ଢ଼', 'ଢ଼');

/** Fail loudly on any non-canonical string, as core/src/rules.ts does for rule files. */
export function checkCanonical(value, path = '$') {
  if (typeof value === 'string') {
    if (value !== canonical(value)) throw new Error(`${path} is not canonical Odia (precomposed nukta or not NFC).`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => checkCanonical(v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) checkCanonical(v, `${path}.${k}`);
  }
}

/** The agent body with the tool IDs filled in. */
export function agentBody(config, toolIds) {
  const body = structuredClone(config.agent);
  body.name = config.name;
  body.tags = config.tags;
  body.conversation_config.agent.prompt.tool_ids = toolIds;
  return body;
}

async function call(method, path, key, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const config = JSON.parse(readFileSync(FILE, 'utf8'));
  checkCanonical(config);
  const key = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (dry) {
    console.log(JSON.stringify({ tools: config.tools.map((t) => ({ tool_config: t })), agent: agentBody(config, ['<tool ids>']) }, null, 2));
    return;
  }
  if (!key) throw new Error('Set ELEVENLABS_API_KEY (ElevenLabs > Developers > API keys).');

  const existing = new Map();
  let cursor;
  do {
    const page = await call('GET', `/v1/convai/tools?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, key);
    for (const t of page.tools ?? []) existing.set(t.tool_config?.name, t.id);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  const toolIds = [];
  for (const tool of config.tools) {
    const id = existing.get(tool.name);
    if (id) {
      await call('PATCH', `/v1/convai/tools/${id}`, key, { tool_config: tool });
      console.log(`tool ${tool.name}: updated (${id})`);
      toolIds.push(id);
    } else {
      const made = await call('POST', '/v1/convai/tools', key, { tool_config: tool });
      console.log(`tool ${tool.name}: created (${made.id})`);
      toolIds.push(made.id);
    }
  }

  const body = agentBody(config, toolIds);
  if (agentId) {
    await call('PATCH', `/v1/convai/agents/${encodeURIComponent(agentId)}`, key, body);
    console.log(`agent updated: ${agentId}`);
  } else {
    const made = await call('POST', '/v1/convai/agents/create', key, body);
    console.log(`agent created: ${made.agent_id}`);
    console.log('Add it on Vercel as ELEVENLABS_AGENT_ID (Production), then redeploy.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
