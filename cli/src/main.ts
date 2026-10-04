#!/usr/bin/env node
/**
 * `odia` — the command-line front end to the engine, and the harness used to
 * verify it by hand.
 *
 * Dependency-free by design: `node:util`'s parseArgs, nothing else. The CLI is
 * a thin shell around the synchronous engine API, so there is nothing here to
 * await and no reason for a framework.
 *
 * Rule and data files are loaded through `@odia/core/node`, the one module in
 * the engine allowed to touch a file system. It resolves them relative to
 * `core/` itself, so the CLI works from any working directory.
 *
 * `odia eval` is deliberately not implemented in this workspace. It shells out
 * to `tools/eval/run_eval.ts`, which owns the metrics and must stay usable on
 * its own via `npm run eval`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { DigitMode, Result } from '@odia/core/types';

const DEFAULT_TOPK = 5;

/** Exit codes: 0 success, 2 bad invocation, 1 anything that failed at runtime. */
const EXIT_OK = 0;
const EXIT_RUNTIME_ERROR = 1;
const EXIT_BAD_INPUT = 2;

const REPO_ROOT = new URL('../../', import.meta.url);

const USAGE = `odia - English to Odia phonetic transliteration

usage
  odia <roman text> [options]
  odia eval [--write-baseline]
  odia --help

options
  -k, --topk <n>       candidates to show per word (default ${DEFAULT_TOPK})
      --digits <mode>  arabic | odia (default arabic)
      --strict         deterministic ITRANS output; no candidates, no ranking
      --codepoints     add a U+XXXX column, grouped by cluster, to every candidate
      --json           machine-readable Result on stdout
  -h, --help           show this message

examples
  odia "kemiti achha"
  odia "namaskaara" --strict
  odia "odisha" --codepoints        verify the nukta invariant by code point
  odia "2026 re" --digits odia
  odia "kemiti" --topk 3 --json

notes
  Several words may be given unquoted; they are joined with single spaces.
  With --json, --codepoints adds a "codepoints" field for the top-1 text.
  A precomposed nukta letter in any candidate is flagged in the output.`;

interface Options {
  help?: boolean;
  strict?: boolean;
  codepoints?: boolean;
  json?: boolean;
  topk?: string;
  digits?: string;
}

/* ------------------------------------------------------------------ *
 * Loading the engine
 * ------------------------------------------------------------------ */

interface Modules {
  createEngineFromDisk: typeof import('@odia/core/node').createEngineFromDisk;
  codepoints: typeof import('@odia/core/normalize').codepoints;
  render: typeof import('./render.js');
}

/**
 * Import the engine, and everything that depends on it, dynamically.
 *
 * `core/dist` is gitignored, so "not built yet" is the state of every fresh
 * clone. A static import would answer that with a module-resolution stack
 * trace before `main` ever runs, which would also break `--help`. Returning
 * null instead lets the CLI say one useful sentence.
 */
const modules = await loadModules();

async function loadModules(): Promise<Modules | null> {
  try {
    const [node, normalize, render] = await Promise.all([
      import('@odia/core/node'),
      import('@odia/core/normalize'),
      import('./render.js'),
    ]);
    return {
      createEngineFromDisk: node.createEngineFromDisk,
      codepoints: normalize.codepoints,
      render,
    };
  } catch (err) {
    // Only a missing build is reported gently; a genuine fault in the CLI's
    // own modules must still surface as itself.
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function main(argv: string[]): number {
  // The eval subcommand is dispatched before parseArgs so that its own flags
  // (--write-baseline) pass through untouched instead of failing strict
  // parsing here.
  if (argv[0] === 'eval') return runEval(argv.slice(1));

  let options: Options;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      // `strict` here is parseArgs' own reject-unknown-flags setting. It is
      // unrelated to the --strict transliteration mode below.
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        strict: { type: 'boolean' },
        codepoints: { type: 'boolean' },
        json: { type: 'boolean' },
        topk: { type: 'string', short: 'k' },
        digits: { type: 'string' },
      },
    });
    options = parsed.values as Options;
    positionals = parsed.positionals;
  } catch (err) {
    return failUsage(message(err));
  }

  if (options.help) {
    console.log(USAGE);
    return EXIT_OK;
  }

  const input = positionals.join(' ').trim();
  if (input.length === 0) return failUsage('no input text given');

  const topk = parseTopk(options.topk);
  if (topk === null) {
    return failUsage(`--topk must be a positive integer, got "${options.topk}"`);
  }

  const digits = parseDigits(options.digits);
  if (digits === null) {
    return failUsage(`--digits must be "arabic" or "odia", got "${options.digits}"`);
  }

  if (modules === null) {
    return failRuntime('the engine is not built.  build it with:  npm run build -w @odia/core');
  }

  try {
    const engine = modules.createEngineFromDisk({ digits });

    if (options.strict) {
      emitStrict(modules, input, engine.strict(input, 'itrans'), options);
    } else {
      emitFuzzy(modules, engine.transliterate(input, { topk }), options);
    }
  } catch (err) {
    return failRuntime(message(err));
  }

  return EXIT_OK;
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

function emitStrict(mods: Modules, roman: string, text: string, options: Options): void {
  if (options.json) {
    console.log(json(withCodepoints(mods, { mode: 'strict', scheme: 'itrans', roman, text }, text, options)));
    return;
  }

  console.log(text);
  if (options.codepoints) console.log(mods.render.renderCodepoints(text));
}

function emitFuzzy(mods: Modules, result: Result, options: Options): void {
  if (options.json) {
    console.log(json(withCodepoints(mods, result, result.text, options)));
    return;
  }

  console.log(mods.render.renderResult(result, options.codepoints === true));
}

/** In JSON mode --codepoints becomes one flat field, so output stays a single object. */
function withCodepoints<T extends object>(
  mods: Modules,
  payload: T,
  text: string,
  options: Options,
): object {
  return options.codepoints ? { ...payload, codepoints: mods.codepoints(text) } : payload;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/* ------------------------------------------------------------------ *
 * eval subcommand
 * ------------------------------------------------------------------ */

/**
 * Run `tools/eval/run_eval.ts` in a child process.
 *
 * `process.execArgv` is forwarded so a run started under tsx keeps its loader.
 * Node 22.18+ strips the types by itself, so this also works when the compiled
 * `dist/main.js` is invoked by plain node.
 */
function runEval(args: string[]): number {
  const script = new URL('tools/eval/run_eval.ts', REPO_ROOT);

  if (!existsSync(script)) return failRuntime(`evaluation harness not found at ${relative(script)}`);

  const child = spawnSync(
    process.execPath,
    [...process.execArgv, fileURLToPath(script), ...args],
    { stdio: 'inherit' },
  );

  if (child.error) return failRuntime(`could not start the evaluation: ${child.error.message}`);
  return child.status ?? EXIT_RUNTIME_ERROR;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** Null means invalid; an absent flag means "use the default". */
function parseTopk(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_TOPK;
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return n >= 1 ? n : null;
}

function parseDigits(raw: string | undefined): DigitMode | null {
  if (raw === undefined) return 'arabic';
  if (raw === 'arabic' || raw === 'odia') return raw;
  return null;
}

/** Repo-relative path, so messages do not carry the reader's home directory. */
function relative(url: URL): string {
  return fileURLToPath(url).slice(fileURLToPath(REPO_ROOT).length);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Bad invocation: complain, show the usage, exit 2. */
function failUsage(text: string): number {
  console.error(`odia: ${text}\n`);
  console.error(USAGE);
  return EXIT_BAD_INPUT;
}

/** Something failed while doing the work: complain, exit 1. */
function failRuntime(text: string): number {
  console.error(`odia: ${text}`);
  return EXIT_RUNTIME_ERROR;
}

// Set the code rather than calling process.exit(): everything above writes
// synchronously to stdout, and process.exit() can truncate a piped write.
process.exitCode = main(process.argv.slice(2));
