#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { diffSnapshots } from '../src/diff.js';
import { formatDiff } from '../src/format.js';

const HELP = `uichanges — find UI changes between versions of your web app

Usage:
  uichanges snapshot <url|file.html> [-o out.json] [--width 1280] [--height 800]
                     [--screen name] [--ignore ".selector"]...
  uichanges diff <before.json> <after.json> [--json] [--fail-on-changes]

Commands:
  snapshot   Open a page in a headless browser and save what the user sees.
  diff       Compare two snapshots and list added, moved, renamed, removed elements.

Options:
  --json             Print the diff as JSON.
  --fail-on-changes  Exit with code 1 when there are changes (for CI).
  -h, --help         Show this help.
`;

function parse(argv) {
  const args = { _: [], ignore: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`Missing value for ${a}`);
      return v;
    };
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '-o' || a === '--out') args.out = next();
    else if (a === '--width') args.width = Number(next());
    else if (a === '--height') args.height = Number(next());
    else if (a === '--screen') args.screen = next();
    else if (a === '--ignore') args.ignore.push(next());
    else if (a === '--json') args.json = true;
    else if (a === '--fail-on-changes') args.failOnChanges = true;
    else if (a.startsWith('-')) fail(`Unknown option ${a}`);
    else args._.push(a);
  }
  return args;
}

function fail(message) {
  process.stderr.write(`uichanges: ${message}\n`);
  process.exit(2);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`cannot read ${path}: ${err.message}`);
  }
}

async function main() {
  const args = parse(process.argv.slice(2));
  const [command, ...rest] = args._;

  if (args.help || !command) {
    process.stdout.write(HELP);
    return;
  }

  if (command === 'snapshot') {
    if (rest.length !== 1) fail('snapshot needs exactly one URL or file');
    const { snapshotPage } = await import('../src/snapshot.js');
    const snapshot = await snapshotPage(rest[0], args);
    const json = JSON.stringify(snapshot, null, 2) + '\n';
    if (args.out) {
      writeFileSync(args.out, json);
      process.stderr.write(`Saved ${snapshot.elements.length} elements to ${args.out}\n`);
    } else {
      process.stdout.write(json);
    }
    return;
  }

  if (command === 'diff') {
    if (rest.length !== 2) fail('diff needs two snapshot files');
    let result;
    try {
      result = diffSnapshots(readJson(rest[0]), readJson(rest[1]));
    } catch (err) {
      fail(err.message);
    }
    process.stdout.write((args.json ? JSON.stringify(result, null, 2) : formatDiff(result)) + '\n');
    if (args.failOnChanges && result.changes.length > 0) process.exitCode = 1;
    return;
  }

  fail(`unknown command "${command}". Run uichanges --help`);
}

main().catch((err) => fail(err.message));
