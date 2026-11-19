#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { diffSnapshots } from '../src/diff.js';
import { formatDiff } from '../src/format.js';

const HELP = `uichanges — find UI changes between versions of your web app and explain them to users

Project workflow (run inside your app's repository):
  uichanges init [--locale ru]     Create .uichanges/ with a config listing your pages.
  uichanges capture                Snapshot every page from the config. First run = baseline.
  uichanges status                 What changed since the baseline, and what still needs a description.
  uichanges describe <id>          Write a description template: .uichanges/changes/<id>.md
  uichanges ignore <id>            Mark a change as not worth showing to users.
  uichanges accept                 Make the current snapshots the new baseline.
  uichanges check                  For CI: exit code 1 if a change has no description.
  uichanges build [-o file]        Compile descriptions into the manifest the browser SDK loads.
  uichanges review [--port 4400]   Describe changes right on your site: highlights + a side panel.

Single files:
  uichanges snapshot <url|file.html> [-o out.json] [--width 1280] [--height 800] [--screen name]
  uichanges diff <before.json> <after.json> [--json] [--fail-on-changes]

Options:
  --storage-state <file>  Playwright session (cookies, localStorage) to open pages logged in.
  --wait-for <selector>   Wait until this element is visible before taking the snapshot.
  --delay <ms>            Extra wait before taking the snapshot.
  --ignore <selector>     Skip this part of the page (repeatable).
  --force                 describe: overwrite an existing description.
  --json                  diff: print JSON.
  --fail-on-changes       diff: exit code 1 when there are changes.
  -h, --help              Show this help.
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
    else if (a === '--storage-state') args.storageState = next();
    else if (a === '--wait-for') args.waitFor = next();
    else if (a === '--delay') args.delay = Number(next());
    else if (a === '--ignore') args.ignore.push(next());
    else if (a === '--locale') args.locale = next();
    else if (a === '--port') args.port = Number(next());
    else if (a === '--force') args.force = true;
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
  const command = args._.shift();

  if (args.help || !command) {
    process.stdout.write(HELP);
    return;
  }

  if (command === 'snapshot') {
    if (args._.length !== 1) fail('snapshot needs exactly one URL or file');
    const { snapshotPage } = await import('../src/snapshot.js');
    const snapshot = await snapshotPage(args._[0], args);
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
    if (args._.length !== 2) fail('diff needs two snapshot files');
    let result;
    try {
      result = diffSnapshots(readJson(args._[0]), readJson(args._[1]));
    } catch (err) {
      fail(err.message);
    }
    process.stdout.write((args.json ? JSON.stringify(result, null, 2) : formatDiff(result)) + '\n');
    if (args.failOnChanges && result.changes.length > 0) process.exitCode = 1;
    return;
  }

  const commands = await import('../src/commands.js');
  const run = {
    init: commands.cmdInit,
    capture: commands.cmdCapture,
    status: () => commands.cmdStatus(),
    describe: commands.cmdDescribe,
    ignore: commands.cmdIgnore,
    accept: commands.cmdAccept,
    check: commands.cmdCheck,
    build: commands.cmdBuild,
    review: commands.cmdReview,
  }[command];
  if (!run) fail(`unknown command "${command}". Run uichanges --help`);
  await run(args);
}

main().catch((err) => fail(err.message));
