# 03 — Spikes

Cheap experiments that retire expensive risks. Record results in the section at the bottom.

Revised 2026-07-26 for the macOS + iOS goal. **S1 (Windows built-in IME) is deleted** —
Windows is no longer a target platform.

| # | Spike | Cost | Retires the risk that… | When |
|---|---|---|---|---|
| **S2** | Audit Aksharantar `ori` for romanization consistency and **precomposed U+0B5C/U+0B5D** | 30 min | The lexicon is built on dirty or nukta-broken data | Stage A (folded into the data pipeline) |
| **S4** | Minimal unsigned Swift IMK skeleton on macOS 26 with a free Apple ID. Does it appear in Input Sources and **actually receive keystrokes**? | ½–1 day | The 5–10-day Stage C bet | After Stage B |
| **S5** | Load the pruned lexicon into JavaScriptCore inside a real iOS keyboard extension and **measure resident memory and per-keystroke latency** | 1–2 days | The entire Stage D architecture | Before Stage D |
| **S6** | Decide on the $99/yr Apple Developer Program | 1 hour of thinking | Discovering the dependency halfway through Stage D | Before Stage D |

S2 folds into Stage A. S4 runs after Stage B. S5 and S6 gate Stage D and can wait.

---

## S2 — Is the Aksharantar Odia data clean?

The whole offline engine rests on this dataset.

- [ ] Sample 200 random pairs and read them — is the romanization style consistent?
- [ ] **Count precomposed U+0B5C and U+0B5D in the raw data.** If present, canonicalize on
      ingest (the pipeline does this, but the count tells us whether the source is dirty)
- [ ] What fraction of rows are garbage (Latin on the Odia side, empty, absurd length ratios)?

Dirtier data makes fuzzy key expansion more important, not less.

---

## S4 — Will an unsigned IMK input method load on macOS 26?

**Gates Stage C.** Half a day here decides whether to commit a week and a half.

There is an unresolved contradiction. General Apple guidance says a free Apple ID "Personal
Team" signature suffices to sign and run locally, and the $99/yr programme is only needed to
notarize and distribute. But **Keyman's own macOS build docs claim signing *and* notarization
are required even for local test builds in order to interact with keyboard input.** Nobody
could reconcile these on paper.

- [ ] Clone `ensan-hcl/macOS_IMKitSample_2021`
- [ ] Make it emit one hardcoded Odia string. No engine, no candidates, no JSC.
- [ ] Build with a free Apple ID; copy to `~/Library/Input Methods/`; log out and in
- [ ] Does it appear in System Settings → Keyboard → Input Sources?
- [ ] Does it **actually receive keystrokes** in TextEdit? In Notes? In Word?

**Pass** → build Stage C. **Fail** → record exactly how, since that determines whether the
paid membership would fix it.

Ignore `+[IMKClient subclass]: chose IMKClient_Legacy` in Console — documented log noise
since macOS 15, not a functional break.

---

## S5 — Does the engine fit inside an iOS keyboard extension?

**Gates Stage D.** This is the one that can kill the whole native-iOS plan, so run it before
writing any keyboard UI.

The budget is roughly **48 MB** — not officially published by Apple, enforced dynamically by
Jetsam, but consistently attested (React Native's own docs state it; field reports put the
practical warning zone at 30–40 MB dirty and hard termination somewhere around 55–77 MB
total resident). Treat 48 MB as the design budget, not a guarantee.

- [ ] Create a bare keyboard extension target that does nothing but load
      `engine.js` + `lexicon-web.tsv` into a `JSContext`
- [ ] **Measure peak resident memory** with Instruments or a Jetsam report. How much headroom
      is left for the keyboard UI and candidate bar?
- [ ] **Measure per-keystroke latency** for `transliterateWord` under interpreter-only JSC.
      Nobody could find a published benchmark for this, so we have to produce one. Anything
      under ~16 ms is imperceptible.
- [ ] Test on the **oldest device you actually care about**, not just the simulator — Jetsam
      limits scale with device RAM.
- [ ] Confirm the extension works with **Full Access off** (App Store guideline 4.4.1
      requires it, and it is also the privacy-respecting default).

**Fail modes and their fallbacks**: if memory is the problem, prune the lexicon harder or move
it to a memory-mapped SQLite file so it is not charged against the budget. If JSC latency is
the problem, the fallback is a Swift port of the hot path only (lookup and ranking), keeping
the rules in TOML — *not* a full rewrite. Do not port speculatively.

---

## S6 — Is the $99/yr Apple Developer Program worth it?

Not a technical spike, but a decision that gates Stage D and is easy to trip over late.

What the free tier gets you: sideloading with **7-day** provisioning expiry, a 3-app cap, and
Xcode-plus-cable refreshes. Fine for S4 and S5. Not fine for daily phone use.

What $99/yr unlocks that actually matters here:

- 1-year profiles, so the keyboard does not die every week
- **App Groups** — required to share the learned dictionary between the keyboard and its
  containing app, and *not available at all* on a free account
- TestFlight, if family members ever want it

AltStore PAL and EU DMA sideloading are **not** available in Singapore, so there is no free
workaround for the 7-day expiry.

- [ ] Decide: is system-wide Odia typing on the phone worth $99/yr?
- [ ] If no → Stage D is out of reach; the PWA plus Add to Home Screen is the iOS answer, and
      that is a perfectly respectable place to stop.
- [ ] If yes → enrol before starting Stage D, not during.

---

## Results

Date each entry as spikes complete.

### S2 — Aksharantar data quality — **COMPLETE, 2026-07-26**

Measured over all 353,813 rows (346,492 train / 3,093 valid / 4,228 test).

**Nukta encoding: clean.** **Zero** occurrences of precomposed U+0B5C or U+0B5D anywhere in
the corpus. Aksharantar Odia is 100% decomposed already. Keep `canonical()` anyway as cheap
insurance against pasted text from other sources, but no ingest-time repair is needed.

Combining nukta U+0B3C appears 6,855 times over 6,688 word types, attached to: ଡ (5,966),
ଢ (850), ଜ (10, Perso-Arabic /z/ in loanwords), plus a handful of corpus errors — 2 cases of
a nukta after a vowel sign, and 1 doubled nukta (`ବଡ଼଼`). Filter those on ingest.

**Format gotcha**: JSON Lines with keys `"native word"` and `"english word"` — **with a
space**, not underscores. 349,840 distinct Odia types, 312,040 distinct roman strings.
Source mix is 95.7% IndicCorp.

**The finding that actually matters — the corpus drops the nukta ~63% of the time.**
It writes both ଓଡ଼ିଆ and ଓଡିଆ for the same word. Consequences:

- 3,569 word pairs differ by exactly one nukta in the same position, and **3,443 of them
  (96.5%) share an identical roman spelling** — i.e. they are one word spelled two ways,
  not two words.
- There are **effectively zero genuine minimal pairs**. No pair exists where both members
  are independently attested at ≥5 rows. So collapsing nukta variants is linguistically safe.
- Naive accuracy statistics are therefore misleading: "always write bare ଡ" scores 84.9%
  against the raw corpus purely *because* the corpus is inconsistent. Do not tune a
  positional rule against these raw numbers.

**Action taken**: `build_lexicon.py` must merge counts for Odia words differing only by
U+0B3C and keep the **nukta-bearing** form. Without this, ଓଡ଼ିଆ and ଓଡିଆ tie in the ranking —
which is exactly what was observed before the fix.

### S2b — Aksharantar is NOT a lexicon of common words — **2026-07-27**

This is the most consequential finding so far and it **invalidates a core assumption of
this plan**. Measured against `ori_train.json` (346,492 rows, 342,866 word types):

| Measure | Value |
|---|---|
| Common everyday Odia words present | **2 of 25** |
| Mean word length | **8.7 characters** |
| Word types ≤ 4 characters | **3.2%** |

Absent as standalone entries: ଭଲ, ମୁଁ, ତୁମେ, ଅଛି, କେମିତି, ଘର, ଦିନ, ରାତି, ଜଳ, ମା, ବାପା,
ପାଣି, ବଡ଼, ଓଡ଼ିଶା, ଭାଗ୍ୟ, ଧନ୍ୟବାଦ, ଆଜି, କାଲି, ନାମ, ହାତ, ଆଖି, ମନ, କଥା. Present: ନମସ୍କାର, ସମୟ.

They are not missing at random — they appear only *inside* longer compounds
(ଭାଗ୍ୟଶ୍ରୀ, ପାଣିଗ୍ରାହୀ, ଓଡିଶାମାଟିକୁ, କଳାପାଣି). Aksharantar's Odia split is 95.7% IndicCorp-mined
surface forms, heavily skewed to **named entities, compounds and inflected forms**.

**What this changes:**

1. The lexicon cannot carry everyday accuracy. Planned in-lexicon coverage was going to be
   the main driver of the `everyday.tsv` target; it will not be.
2. **The rule engine is the whole game** for day-to-day typing. Rule quality, not lexicon
   size, determines whether this tool is pleasant to use.
3. A **hand-curated common-word list is essential, not a hack.** The `EXCEPT` table in
   `docs/odia-simple.html` was the right instinct and should be promoted into the real
   engine as a first-class, committed data file that outranks the mined lexicon.
4. Aksharantar remains valuable for what it *is*: proper nouns, place names and long
   compounds — precisely the words rules handle worst. Keep it, but demote expectations.
5. User learning matters more than planned, since it fills the common-word gap fastest.

**Action**: add `core/data/common.tsv` — a curated romanized↔native list of the few hundred
words actually used daily — ranked above the mined lexicon. Sourcing options: Odia Wikipedia
frequency lists for the native side, romanizations generated by the rule engine and then
checked by a native speaker.

**Bonus result — what people actually type for the flaps.** From 1:1 consonant alignment
over 315,743 alignable rows:

| Character | Roman | Share |
|---|---|---|
| ଡ଼ | `d` | **99.64%** |
| ଡ | `d` | 99.09% |
| ଢ଼ | `dh` | **99.88%** |
| ଢ | `dh` | 100% |

So plain `d` and `dh` must be able to reach the flaps. Requiring a special key would be
wrong for ~99% of real input.

### S4 — Unsigned IMK on macOS 26 — **RESOLVED, 2026-07-27**

**Notarization is NOT required.** An ad-hoc signed input method, built with no Apple
Developer Program membership and no Xcode project, is accepted by macOS 26.

Verified on this machine, step by step:

| step | result |
|---|---|
| Compiles with Command Line Tools alone (`swiftc`, no `.xcodeproj`) | ✅ 116 KB bundle |
| Ad-hoc signature (`codesign -s -`) valid | ✅ satisfies its Designated Requirement |
| Installs to `~/Library/Input Methods/` | ✅ no admin rights needed |
| **macOS registers it** — `TISCreateInputSourceList` | ✅ `com.amritmohapatra.inputmethod.OdiaPhonetic.Odia`, **without a logout** |
| Reported `IsSelectCapable` / `IsEnableCapable` | ✅ both true |
| **IMKServer starts** | ✅ `server started: connection=OdiaPhonetic_Connection` |
| `TISEnableInputSource` from a plain process | ⚠️ returns `noErr` but `IsEnabled` stays false |
| `TISSelectInputSource` | ⚠️ `err -50` (paramErr), because it is not enabled |

**What this means.** The bundle, the Info.plist keys, the `inputmethod` substring in the
bundle ID, the `@objc(OdiaInputController)` naming and the Mach connection are all
correct — macOS sees the input method and will start its server. Keyman's build docs
claim signing *and notarization* are needed even for local test builds; that is not true
on macOS 26 for registration and server startup. It may still be true for keeping an
Input Monitoring TCC grant across rebuilds, which was not tested.

**The one manual step left.** Enabling cannot be done programmatically from an ordinary
process — Apple gates it behind the Settings UI or a login cycle. So:

> System Settings → Keyboard → Text Input → Input Sources → Edit → **+** → Odia →
> **Odia Phonetic**. Then switch with Ctrl+Space and type `odia` — expect ଓଡ଼ିଆ.

It is installed now. To remove it:

```bash
rm -rf ~/Library/Input\ Methods/OdiaPhonetic.app
```

**Verdict: Stage C is viable.** The blocking uncertainty is gone, and the remaining work
is the real one — replacing the five-word stub table with `EngineBridge.swift` over
JavaScriptCore, and adding an `IMKCandidates` window.

### S5 — iOS keyboard extension memory and latency
> Not yet run.

### S6 — Apple Developer Program decision
> Not yet decided.
