# "The Art of Building Software" as a guidebook for the Odia app

Review date: 2026-10-04. Repository state: branch `claude/festive-hawking-ie6xyt`, last
commit `6491528`. No repository file was changed for this review.

## 0. What was read

- The whole PDF: 75 of 75 pages, converted with `pdftotext -layout` (3,391 lines) and read
  from the first line to the last (cover, contents, Chapters 1–27, Appendices A–E, 29
  references).
- The figures are simple labelled boxes and arrows, and their labels come through in the
  text. I viewed two pages as images to confirm this: PDF page 28 (Figure 11.1,
  "scopes of evidence") and PDF page 60 (Chapter 27, the worked method).
- For the project: `CLAUDE.md`, `AGENTS.md`, `README.md`, `plan/02-stages.md` (Stages A and B),
  `plan/04-scope.md`, `plan/05-v3-direction.md` (§1–4 and §11–14),
  `plan/06-owner-followups.md`, the last 15 commits with their full messages,
  `package.json` files, `.gitignore`, `tools/eval/run_eval.ts` and `baseline.json`, and
  the folder layout. I checked for CI files, tags, a changelog and a feedback link.

**What the book is.** A guide written with Codex from the Coursera "Amazon Junior Software
Developer" lectures. It uses a "Hobby Library" app as its running example. Its code is
Java, SQL, JavaFX and Spring Boot. Its main message is not about Java. It is: **every claim
about software needs evidence at the right boundary, and every feature should be small,
specified and checked before the next one.**

---

## 1. Structure of the book (one line per chapter)

| # | Chapter | In one line |
|---|---|---|
| — | A note to the curious reader | For a person who codes sometimes; the aim is to judge and direct software work, not to type it. |
| 1 | An app is a connected system | Input, state, rules, output and storage; tool roles; secrets do not go into source code. |
| 2 | Values give information a shape | Types, names with units, empty vs missing; text length is not the same as visible characters. |
| 3 | Decisions, repetition and named actions | Conditions, loops, and functions described as small contracts. |
| 4 | Objects carry state and responsibility | Classes, invariants ("a rule that must always hold"), encapsulation. |
| 5 | Components that can change independently | Interfaces, composition over inheritance, no abstraction before a need. |
| 6 | Failure is part of the design | Errors are expected paths; never say "Saved" before the save succeeded. |
| 7 | Remembering beyond one run | Files, UTF-8 encoding, safe saving, versioned data formats. |
| 8 | Keeping a sequence | Arrays vs linked lists; choose by the operations you need. |
| 9 | Organising by purpose | Maps, sets, stacks, queues. |
| 10 | Algorithms without interview puzzles | Search, sort, Big-O; optimise only a measured bottleneck. |
| 11 | Evidence that software behaves | Unit, integration, system and acceptance tests; write the failing test first; CI. |
| 12 | Designing durable data | Database tables, keys, constraints, normalisation. |
| 13 | Asking and changing with SQL | Queries, joins, counting; check the target rows before a change. |
| 14 | Java meets the database | JDBC, prepared statements, transactions. |
| 15 | A desktop window | JavaFX; design every state around a button (empty, slow, failed). |
| 16 | The web page | HTML meaning, CSS layout, accessibility, responsive design. |
| 17 | Bringing the page to life | JavaScript, the DOM, events, loading / empty / error states, stale results. |
| 18 | The server's responsibilities | MVC, Spring Boot, validation on the server. |
| 19 | APIs are explicit agreements | HTTP methods, status codes, Fetch, CORS. |
| 20 | Trust, privacy and secure behaviour | Authentication vs permission; keep credentials out of code and logs; collect less data. |
| 21 | From laptop to something usable | Build vs package vs run; smallest delivery route; a release needs evidence and a recovery plan. |
| 22 | From wish to testable feature | Requirements, user stories, acceptance criteria before code. |
| 23 | Design before detail | Architecture, short decision records, patterns, UX including interruptions. |
| 24 | A development rhythm | Lifecycle loops, Agile, Scrum, CI vs continuous delivery vs deployment; "definition of done". |
| 25 | Git as a history you can reason about | Working tree, staging, commits, branches; read the diff; avoid rewriting shared history. |
| 26 | Keeping an app understandable | Clear names, stale comments are harmful, debugging as an investigation, logs vs metrics, bug reports. |
| 27 | A complete development method | Worked example: a moment in a user's day → spec → claim-to-evidence table → slices → release note → a brief for a coding assistant. |
| A | Tool atlas | What each tool answers (IDE, Git, CI, browser dev tools, cloud services). |
| B | Glossary | Short linked definitions. |
| C | How the lectures became the guide | Its own provenance: sources, gaps, module-to-chapter map. |
| D | Clarifications worth keeping | Corrections to the lecture wording (Java, SQL, web, Git, Scrum). |
| E | Using the companion examples | The demo files and what each one does and does not prove. |

Chapters 2–15 and 18 are mostly about Java, relational databases and desktop windows. They
teach general ideas, but most of their detail does not apply to this project (see §3).

---

## 2. Practices: does the project follow them?

"We do it" is judged from files and commits, not from intentions. Actions are proposed
only where they are worth it for one owner with AI agents doing most of the coding.

### 2.1 Things the project already does well (keep doing them)

| Practice (chapter) | We do it? | Evidence |
|---|---|---|
| **Small, coherent commits that explain the reason** (25.1, 27.6) | Yes, strongly | Every recent commit body states the cause, the change and the check, e.g. `bbacc9f` (service-worker caches), `5baff09` (font, with sha256). |
| **Write the failing test first** (11.4) | Yes | `ebba741`: "2 new tests … (the first fails on the old code)". |
| **Evidence at the boundary the claim is about** (11.2, 27.5, D.4) | Yes | Engine claims → `core` tests (132). UI claims → checked in headless Chromium (`12036a4`: "bus" kept, `localStorage` holds it). Safari → `tools/eval/webkit-check.py`. The book's Figure 11.1 point is followed. |
| **Measured regression checks** (11.2, "regression") | Yes, beyond the book | `tools/eval/baseline.json`, held-out split "in-lexicon vs OOV, never average" (`run_eval.ts`), everyday set, coverage set. D-12 was measured before and after (`65ce29c`). The book has no idea of a measured quality baseline; the project does more here than the book asks. |
| **Short decision records with options and consequences** (23.1) | Yes | `plan/05-v3-direction.md` §11 (D-0 to D-12, open ones with triggers); `plan/04-scope.md` gives a reason for each exclusion. |
| **Scope as a design tool; say no cheaply** (22.4, 27.1) | Yes | `plan/04-scope.md` "The test for adding anything". |
| **Success criteria per stage ("definition of done")** (24.5, 22.2) | Yes, for A and B | `plan/02-stages.md`: Stage A "held-out top-1 ≥ 35%… under 5 ms"; Stage B "loads under 2 s… works with Wi-Fi off… Copy pastes into WhatsApp". V1 in `plan/05` §13 has a content list but no success line yet (see gap G7). |
| **Representation discipline: encodings, text is not what it looks like** (2.4, 7.1) | Yes, central | The nukta invariant, `canonical()` at every boundary, "verify by code point", `\u` escapes in TypeScript (README). |
| **Know your dependencies: name, version, source** (1.3, 26.5) | Yes | `PROVENANCE.md` files with licences and sha256 (`fb3f91d`); `package-lock.json` committed; font version recorded. |
| **Collect only what the app needs** (20.4 box) | Yes | No accounts; "Nothing typed leaves the device" (`plan/05` §2); assist layer is opt-in per feature with the company named (§4 rule 3). |
| **Keep secrets on the server** (18.1, 20.3) | Planned | `plan/05` §4: "API keys stay on the server." No keys exist yet. |
| **A brief to a coding assistant with scope, constraints and evidence** (27.8) | Yes | `CLAUDE.md`, `AGENTS.md`, the team roles in `plan/05` §13, and commit messages that report evidence. |
| **Prototype ≠ release; state what was NOT checked** (24.2, 27.1) | Yes | `plan/06` A-3: WebKit checks still owed because the cloud box has only Chromium. |
| **Debugging as an investigation, fix the cause not the symptom** (26.3) | Yes | `ebba741`: the caret-bar symptom was traced to `rank()` in `core/src/rank.ts`, and the root cause was fixed. |

### 2.2 Gaps, with a small action for each

| # | Practice (chapter) | We do it? | Gap | Small action |
|---|---|---|---|---|
| G1 | **Continuous integration ("CI": a service that runs the checks on every push)** (11.4, 24.5, Appendix A) | No | There is no `.github/` folder. Every check runs only if an agent remembers. With several agent sessions on parallel branches, `zealous-brown-hpenqp` broke the Appv2 rule build, and this was noticed only because another session ran the check by hand (`plan/06` E-1). | One GitHub Actions file that runs: core tests, Appv2 tests, `node docs/odia-simple.test.mjs`, `gen-rules:check`, `npm run eval` (print the delta). Free for private repos within the monthly minutes. |
| G2 | **One command runs all the checks** (11.3) | Partly | Root `npm test` runs only `@odia/core` (`package.json`). Appv2's 15 tests and the 58 fallback checks are separate commands. | Make root `npm test` call all three (or add `npm run check`). CI then calls the same one command. |
| G3 | **A release records the version, its evidence and how to go back** (21.4, 27.7) | No | `git tag` is empty. No changelog. No written rollback ("go back to the previous working version") step. No rule for when `baseline.json` may be rewritten with `--write-baseline` (it is dated 2026-07-27). | At each V1 release: a git tag ("a named bookmark on a commit"), and a 5-line release note in the book's 27.7 shape (what changed, numbers vs baseline, what was not checked, known limits). One sentence in the plan: "Rollback = in Vercel, promote the previous deployment." One sentence on when the baseline is refreshed. |
| G4 | **Stale documentation is a second, contradictory program** (26.2) | Partly | `README.md` still says "Only `core/` has source today … `npm run build` will fail" and lists only three workspaces; it does not mention Appv2 or Vercel. `CLAUDE.md` says the everyday set is `core/test/golden/everyday.tsv`; the folder holds `everyday-source.txt` (a naming drift, not a missing test). | Fix both lines in one small commit. Agents read these files first, so wrong lines cost real time. |
| G5 | **Secrets never in source control, browser bundles or logs** (1.3, 20.3) | Not yet needed | `.gitignore` has no `.env*` line. The US$20/month cap (D-4) has no mechanism named. Nothing stops a stranger from calling `/api/translate` in a loop once it exists. | Before V3: add `.env*` to `.gitignore`; keep keys only in Vercel environment variables; add a rate limit ("max requests per minute per visitor") in each function; set a spending limit at each provider so D-4 is enforced by the provider, not by hope. Log the request size and status, never the user's text. |
| G6 | **A useful bug report; feedback from real use** (26.5 box, 24.1, 27.7) | No | No way for a user (the parents, later the public) to report a wrong word. Grep of `web/src` and `Appv2/src` finds no feedback link. | A "Report this word" button that **copies** the typed roman, the chosen and the expected Odia, the code points and the app version to the clipboard, plus a mailto or GitHub-issue link. No network call from the app, so the offline promise holds. |
| G7 | **Acceptance criteria before building** (22.4 box, 27.2, 27.5) | Partly | V1 in `plan/05` §13 lists content but has no success line like Stages A and B. | Write a V1 claim-to-evidence table (book Table 27.1 style): e.g. "Works with Wi-Fi off after the first load → check in Chrome and Safari", "Family-safe filter on by default → guard test", "Keyboard only, no mouse → manual walkthrough", "Dictionary loads without blocking typing → load-time check". |
| G8 | **Interface states: loading, empty, failed** (15.4 box, 17.4) | Unknown | The V1 dictionary (8.6 MB today) becomes a separately loaded file. The book warns that "empty" and "failed" must look different, and that slow work can freeze the page. | In the V1 spec: show "dictionary loading…", then either meanings or "dictionary unavailable — typing still works". Measure that typing is not blocked while it loads. |
| G9 | **Limit work in progress** (24.3) | Partly | `plan/06` §E: three agent branches at once; two conflict, one breaks a build. | A simple rule for agents: one open feature branch per area (rules / lexicon / app); merge or close before starting the next. |
| G10 | **Accessibility: labels, keyboard, contrast, zoom** (16.1, 16.3, 23.4) | Not checked | No recorded keyboard-only or screen-zoom check for the apps. | Add one keyboard-only walkthrough to the V1 acceptance list (G7). No new tooling needed. |
| G11 | **Backups need a restore test; know where user data lives** (21.4, 27.6) | Partly | Learned words live in each browser's `localStorage`. Clearing site data loses them. V1 merges two apps: their storage keys must carry over. | Write down in the V1 spec what happens to already-learned words when the apps merge, and test it once. Export/import stays deferred (`plan/04-scope.md`). |

### 2.3 Practices deliberately not recommended

| Book practice | Why not for this project |
|---|---|
| Scrum roles, sprints, daily stand-ups, story points (24.4) | The book itself says a hobbyist need not simulate a company's meeting calendar (24.3). Owner approval per stage already gives the feedback loop. |
| Formal user stories with INVEST (22.3) | The plan's "a moment in someone's day" (parents typing to family) plus acceptance criteria (G7) is enough. |
| UML class and sequence diagrams (23.2) | The ASCII architecture in `plan/05` §4 already answers the real question (what is offline, what is online). |
| Gitflow branches (25.4) | The book says it is optional. Short-lived branches per agent session are fine. |
| Code-review ceremony by a second human | No second developer. The equivalent is CI (G1) plus the owner reading the release note. |
| Logs, metrics and traces with dashboards (26.4) | Nothing to monitor until the assist layer exists. At V3, Vercel's built-in function logs are enough (with the "no user text in logs" rule from G5). |
| Design patterns catalogue (23.3) | Recognising names is useful; building them in is not needed. |

---

## 3. Where the book conflicts with this project, or is outdated

1. **Most of the technical content is Java, SQL databases, JavaFX and Spring Boot**
   (Chapters 2–15, 18). This project is TypeScript, its data is TSV and TOML, user state is
   `localStorage`, and the future server part is a few Vercel functions. The ideas carry
   over (invariants, safe saving, validation at the boundary). The syntax, JDBC,
   transactions, Spring and AWS EC2/RDS details do not. Do not let an agent add a database
   or a server framework because the book has chapters on them.
2. **Login and ownership checks (20.1, 20.4) mostly do not apply.** There are no accounts.
   What does apply from Chapter 20: keys off the client (20.3) and a "negative test" — a
   request that should be refused (feature switched off, oversized text, too many requests)
   is in fact refused (20.4).
3. **"Synchronous heavy work blocks the interface" (17.4) vs the project's rule "the
   engine is synchronous"** (`CLAUDE.md`). No real conflict: each keystroke takes under
   5 ms (Stage A target). The real risk is reading the large dictionary file on the main
   thread at start-up in V1. Treat it as something to measure (G8), not a reason to change
   the engine.
4. **The book has no idea of data-driven quality.** Its tests are pass/fail. This
   project's quality is a number (top-1, top-3 against a baseline) that moves with every
   rule or lexicon change. The project's "never commit a rule change without the metric
   delta" rule is stronger than anything in the book. Keep it.
5. **The book's own scope** (Appendix C): it comes from lecture transcripts, Course 6 is
   missing, and it was written by an AI tool. Its corrections in Appendix D look careful
   (PUT not PUSH; `no-cors`; Scrum guide sprint lengths). Cloud prices and console steps
   (21.3, 21.4) are, as the book itself warns, things to check at the time of use.
6. **"Avoid rewriting shared history" (25.4)** agrees with the plan. It is the reason
   `plan/05` §12 recommends a fresh repository for a public release instead of rewriting
   history to remove `tools/build-data/webcorpus/`.
7. **"Choose the smallest delivery route that fits" (21.2)** agrees with the plan: a static
   site on Vercel, with server functions only for the opt-in assist layer.

---

## 4. Top 5 to adopt now for the V1 web app

Each is one small commit or one setting.

1. **CI on every push (G1 + G2).** One GitHub Actions workflow that runs the core tests,
   the Appv2 tests, the fallback checks, the Appv2 rule check and the eval, and shows the
   metric change. Make root `npm test` run the same set. Why now: several agent sessions
   already work in parallel, and one branch broke a build that was caught only by a manual check.
2. **Release note + tag + one-line rollback (G3).** For each Vercel release: a git tag, a
   5-line note (what changed, numbers vs baseline, what was not tested, known limits), and
   the rule "rollback = promote the previous deployment in Vercel". Also say when
   `baseline.json` may be refreshed. Use Vercel preview deployments (each branch gets its
   own test address) for the owner to try a change before it goes live.
3. **A V1 acceptance table before the merge work starts (G7, G8, G10, G11).** Copy the
   book's claim → mechanism → evidence table. Include: works offline after first load,
   family-safe on by default, keyboard-only use, dictionary loading/failed states, learned
   words survive the merge of the two apps, Safari checks (`plan/06` A-3).
4. **Offline "Report this word" (G6).** Copies a ready-made bug report (input, output,
   expected, code points, version) and opens an email or issue link. This turns the
   parents' and testers' use into test cases for the everyday set, without breaking the
   no-network rule.
5. **Secrets and cost guard, set up before the first API key exists (G5).** `.env*` in
   `.gitignore`; keys only in Vercel environment variables; a per-visitor rate limit in
   each function; a spending limit at each provider to enforce the US$20/month cap (D-4);
   logs record status and size, never the user's text.

Also worth doing in the same tidy-up commit: fix the two stale lines in `README.md` and
`CLAUDE.md` (G4).

---

## 5. Using the book as a guidebook from now on

The most useful parts for this project are, in order: **Chapter 27** (the whole method,
and §27.8 on briefing a coding assistant), **Chapter 11** (scopes of evidence),
**Chapter 21.4** (release and recovery), **Chapter 22** (acceptance criteria) and
**Chapter 26** (stale docs, debugging, bug reports). The owner can use the 27.8 questions
when reading any agent's report: *What changed? Why? How was it checked? What is still
uncertain?* The project's commit messages already answer these; CI and release notes
would make the answers automatic and visible.
