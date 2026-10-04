/**
 * Run every Appv2 check, in the order that makes a failure interpretable.
 *
 *   0. gen-rules --check   FIRST, always. A metric reported against a rule file
 *                          that no longer matches its delta is worse than no
 *                          metric, because it looks like evidence.
 *   1. no-regression       does everyday Odia still work? The most important
 *                          question, so it runs before the new features.
 *   2. sanskrit-coverage   is every Sanskrit mark reachable by some route?
 *   3. sloka               how accurate is it on real verse?
 *
 *     npx tsx Appv2/eval/run.ts
 *
 * Exits non-zero if any step does.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { APPV2, ROOT } from './lib.js';

interface Step {
  name: string;
  script: string;
  args?: string[];
  /** A failure here is advisory, not fatal. */
  soft?: boolean;
  /** Run under python3 rather than node. */
  python?: boolean;
  /** Skip silently when this file is absent. */
  needs?: string;
}

const STEPS: Step[] = [
  { name: 'rule files up to date', script: 'scripts/gen-rules.ts', args: ['--check'] },
  {
    // Cheap, no dependencies, and it guards a failure mode nothing else catches:
    // an undefined CSS custom property silently uses its light-mode fallback in
    // every colour scheme. That is what made the candidate bar white at night.
    name: 'theme tokens complete (light + dark)',
    script: 'eval/check-theme.mjs',
  },
  { name: 'no regression in everyday Odia', script: 'eval/no-regression.ts' },
  { name: 'Sanskrit coverage', script: 'eval/sanskrit-coverage.ts' },
  { name: 'śloka accuracy', script: 'eval/sloka.ts', soft: true },
  {
    // Last, and soft: it needs playwright AND a built single-file app, neither
    // of which a fresh clone has. But it is the only step that proves the
    // features work in the browser the app is actually opened in — node passing
    // and Safari failing is exactly how the Object.hasOwn bug reached a tester.
    name: 'Sanskrit features in WebKit',
    script: 'eval/webkit-sanskrit.py',
    python: true,
    soft: true,
    needs: 'docs/odia-app-sanskrit.html',
  },
];

function main(): number {
  let failed = 0;
  const results: { name: string; code: number; soft: boolean }[] = [];

  for (const step of STEPS) {
    if (step.needs !== undefined && !existsSync(resolve(ROOT, step.needs))) {
      console.log(`\n${'='.repeat(76)}\n>>  ${step.name}  — SKIPPED, ${step.needs} not built\n${'='.repeat(76)}`);
      results.push({ name: `${step.name} (skipped)`, code: 0, soft: true });
      continue;
    }

    console.log(`\n${'='.repeat(76)}\n>>  ${step.name}\n${'='.repeat(76)}`);

    // process.execArgv is forwarded so a tsx-started run keeps its loader —
    // the same reason cli/src/main.ts does it when it shells out to run_eval.
    const result = step.python
      ? spawnSync('python3', [resolve(APPV2, step.script), ...(step.args ?? [])], {
          cwd: ROOT,
          stdio: 'inherit',
        })
      : spawnSync(
          process.execPath,
          [...process.execArgv, resolve(APPV2, step.script), ...(step.args ?? [])],
          { cwd: ROOT, stdio: 'inherit' },
        );

    const code = result.status ?? 1;
    results.push({ name: step.name, code, soft: step.soft === true });
    if (code !== 0 && step.soft !== true) failed += 1;
  }

  console.log(`\n${'='.repeat(76)}\n>>  summary\n${'='.repeat(76)}`);
  for (const r of results) {
    const mark = r.code === 0 ? 'PASS' : r.soft ? 'warn' : 'FAIL';
    console.log(`  ${mark}  ${r.name}`);
  }

  if (failed > 0) console.log(`\n${failed} required check(s) failed.`);
  return failed === 0 ? 0 : 1;
}

process.exit(main());
