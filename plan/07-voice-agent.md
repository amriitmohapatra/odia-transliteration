# 07 — Voice helper with ElevenLabs (V3.5 to V3.7)

**Started:** 2026-11-13. **Branch:** `claude/youthful-albattani-niljob`.
**Style:** STE-flavored, as in `plan/05-v3-direction.md`.

## 1. Owner decision D-15 (2026-11-13)

The owner has a free ElevenLabs **Creator** subscription for one month. ElevenLabs has
Odia and English voice agents. The owner chose:

| Question | Answer |
|---|---|
| What does ElevenLabs do in the app? | **Both**: a spoken helper ("Talk"), and the existing Listen and Speak buttons through ElevenLabs |
| What is the spoken helper for? | **All three**: dictate and fix text; word and meaning help; practice conversation |
| Plan | Creator (one month, free) |

**Owner, 2026-11-13 (clarification): "We are not going to use Sarvam AI at all."**
ElevenLabs (USA) is the only voice provider. It replaces Sarvam in D-3. The Sarvam code
was removed. The device's own Odia voice stays for Listen: it is offline and free.

## 2. What ElevenLabs supports for Odia (docs read 2026-11-13)

| Product | Model | Odia | Use here |
|---|---|---|---|
| Text to speech | `eleven_v4` (90+ languages) | Yes, `or` | `/api/speak` (Listen) |
| Speech to text | `scribe_v3` (90+ languages) | Yes, `ori` | `/api/listen` (Speak) |
| Voice agent | ElevenAgents: Scribe realtime + an LLM + `eleven_v4_turbo` | Yes, `or` | Talk |
| Agent LLM | many; includes `claude-haiku-5-5` | — | Same model family as `/api/translate` |

Facts that shape the design:

1. **The key stays on the server.** The browser gets a conversation token from our own
   route. A token is valid for 15 minutes. With `enable_auth`, the agent refuses a
   browser that has no token.
2. **Client tools.** The agent can call functions in the page. The page runs them and
   returns the result to the agent. This is how the agent types Odia into the box and
   uses the app's own dictionary.
3. **Retention.** By default ElevenLabs keeps agent transcripts and audio for 2 years.
   Zero Retention Mode is for enterprise customers. We set `record_voice: false`,
   `delete_audio: true`, `delete_transcript_and_pii: true`, `retention_days: 0`.
4. **Licence.** Paid plans give commercial rights. The free plan is non-commercial with
   attribution. After the month the account drops to the free plan: credit ElevenLabs
   then, or turn it off (§6).
5. **SDK.** `@elevenlabs/client` (MIT) with `livekit-client` (Apache-2.0) for WebRTC.
   Pinned to 1.32.1 (released 2026-10-29). Loaded only when Talk starts.

## 3. Stages

| Stage | Content | Done when |
|---|---|---|
| **V3.5** ElevenLabs for Listen and Speak | `api/_lib/speech.ts`: Eleven v4 (`or`) and Scribe v3 (`ori`) only; Sarvam removed. The service worker never caches `/api/` | Unit tests with a fake fetch; browser check passes |
| **V3.6** Talk | Settings > "Voice helper" (off by default, not in kids). A **Talk** button. `POST /api/agent` returns a conversation token. `Appv2/src/agent.ts` starts the session and runs the client tools. The agent definition is code: `tools/assist/agent/odia-helper.json`, pushed by `tools/assist/agent/push.mjs` | Unit tests for the route and the tools; browser check with a stand-in SDK |
| **V3.7** Owner test | The owner adds the key, pushes the agent, tries the three uses on a phone and a laptop (A-15) | Owner feedback |

## 4. The voice helper (V3.6)

### One agent, three uses

The agent's first message asks what the user wants, in Odia and English. The prompt
covers all three uses:

| Use | The user says | The agent does |
|---|---|---|
| Dictate and fix | "Write: ମୁଁ ଆଜି ଘରକୁ ଯିବି" / "Change ଯିବି to ଯାଉଛି" | `type_odia`, `replace_text` |
| Word help | "What does ଓଡ଼ିଆ mean?" / "How do I write 'kemiti achha'?" | `look_up`, `spell` |
| Practice | "Let's talk in Odia" | Speaks simple Odia; explains in English when asked |

### Client tools (in the page, `Appv2/src/agent-tools.ts`)

| Tool | Arguments | Does | Returns to the agent |
|---|---|---|---|
| `read_text` | — | Reads the text box and the selection | The text (at most 2,000 characters) |
| `type_odia` | `text` | Types Odia at the caret, after `canonical()` | "Typed." or why not |
| `replace_text` | `find`, `replace` | Replaces the first exact match (after `canonical()`) | "Replaced." or "Not found." |
| `look_up` | `word` | The app's dictionary: owner meaning, AI meaning, Praharaj | Meanings as plain text |
| `spell` | `roman` | The engine's top 5 Odia words for a romanized word | The list |

Rules for the tools:

- They change only the text box, through the editor (so Undo works). They never touch
  other page elements and never insert HTML.
- `type_odia` refuses text with no Odia letters and text over 500 characters.
- Every Odia string passes `canonical()` (the nukta invariant, `CLAUDE.md`). LLMs can
  write the precomposed ଡ଼ (U+0B5C).
- `look_up` and `spell` run offline in the page. The dictionary does not go to
  ElevenLabs as a knowledge base.

### Limits (cost and abuse)

| Limit | Value | Where |
|---|---|---|
| Longest conversation | 5 minutes | agent `max_duration_seconds` |
| Silence ends the call | 30 seconds | agent `silence_end_call_timeout` |
| Conversations at once | 2 | agent `call_limits.agent_concurrency_limit` |
| Conversations per day | 40 | agent `call_limits.daily_limit` |
| Bursting (double price) | off | agent `call_limits.bursting_enabled` |
| Who may start | the adult site only | origin check in `/api/agent`; agent `auth.allowlist` |

40 calls of at most 5 minutes is at most 200 minutes a day. The Creator plan's monthly
credit is the real cap: when it is spent, the agent stops. The owner checks usage in
the ElevenLabs dashboard in week 1 and lowers `daily_limit` if needed.

### Privacy

- The line under the page names what goes online while the switch is on: "Talk sends
  your voice and the text in the box to ElevenLabs (USA)."
- The agent sees the text box only when it calls `read_text`, and only during a call.
- Retention settings as in §2.3.

## 5. Unknowns (only a real key or the owner can answer)

| # | Question | How we find out |
|---|---|---|
| U-1 | Is Eleven v4's Odia voice clear to a native speaker? | Owner listens (A-15) |
| U-2 | Does Scribe write Odia speech in Odia script, and English speech in Latin, in one call? | Owner test; else set the agent's language to `or` with an `en` preset |
| U-3 | Does the agent's LLM write correct Odia? | Owner test; the tools' `canonical()` fixes only the encoding, not the spelling |
| U-4 | How many credits does one minute of Talk use on Creator? | Dashboard after the first calls |
| U-5 | Scribe v3's word error rate on everyday Odia sentences, by speaker and dialect | Optional: recordings of `everyday.tsv` sentences |

## 6. After the month

1. Remove `ELEVENLABS_API_KEY` from Vercel and redeploy.
2. Talk, Listen (when the device has no Odia voice) and Speak then say "not set up".
   Listen with the device's own Odia voice still works.
3. No code change is needed. To keep ElevenLabs, pay for a plan and keep the key.

## 7. Handoff: connect ElevenLabs from the owner's Mac (2026-11-15)

The cloud session cannot reach the owner's computer or Chrome. The owner continues in
a local Claude Code session (`claude --teleport` carries this conversation; this list is
the backup). The local session guides the owner in their logged-in Chrome
(`claude --chrome`) and runs the commands on the Mac.

Rules: the API key never goes in the chat, a file in the repository, or a commit. It
lives only in the shell (`export ELEVENLABS_API_KEY=…` typed by the owner) and in Vercel.

| # | Where | Step | Done when |
|---|---|---|---|
| 1 | Mac terminal | `git fetch && git checkout claude/youthful-albattani-niljob && npm ci` | Clean checkout |
| 2 | ElevenLabs (Chrome) | Developers > API keys > create a key with access to Text to Speech, Speech to Text and Agents (ElevenAgents) read/write. Copy it once | Key copied |
| 3 | Mac terminal | Owner types `export ELEVENLABS_API_KEY=…`, then `node tools/assist/agent/push.mjs --dry-run`, then `node tools/assist/agent/push.mjs` | Prints `agent created: agent_…` |
| 4 | ElevenLabs (Chrome) | **Done 2026-11-15:** agent `agent_5101m7emjq35fjfrv7kbb2b362xq`; voice Biju S (`CcHmMQ6bJ7E63DL9HqWd`, an Odia library voice, chosen by the owner) set in `odia-helper.json`. Open the agent: check language Odia (+ English), LLM `claude-haiku-5-5`, the 5 client tools, Security: authentication on, allowlist `odia-transliteration-web.vercel.app`; Privacy: retention 0, voice not recorded. Pick a voice that reads Odia well and note its voice ID | Settings match `odia-helper.json`; fix the JSON (not the dashboard) and push again if not |
| 5 | ElevenLabs (Chrome) | Agent page "Test AI agent": say an Odia sentence, ask a meaning. Client tools will not run there (they need the app) | Odia heard and understood |
| 6 | Mac terminal | Live check of speech: `npx vitest run --root tools/assist` (fake), then one real call: `curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/<voice>?output_format=mp3_44100_64" -H "xi-api-key: $ELEVENLABS_API_KEY" -H 'content-type: application/json' -d '{"text":"ଓଡ଼ିଆ","model_id":"eleven_v4","language_code":"or"}' -o odia.mp3 && afplay odia.mp3` | You hear ଓଡ଼ିଆ |
| 7 | Vercel (Chrome) | Adult project > Settings > Environment Variables (Production): `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, optional `ELEVENLABS_VOICE_ID` | Saved |
| 8 | GitHub | Owner decides: merge this branch (PR) so Vercel deploys it | Deployed |
| 9 | The site (Chrome) | Settings > Voice helper on > Talk: dictate, fix a word, ask a meaning, practise. Also Listen and Speak with the online switches | A-15 answered |

Report back to the cloud session (message it, or paste in its chat): the agent ID (not
secret), what failed with the exact error text, and how the Odia sounded.
