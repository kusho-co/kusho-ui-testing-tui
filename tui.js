const { clack } = require('./ui');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const spawn = require('cross-spawn');

const ROOT_DIR = __dirname;
const CLI_ENTRY = path.join(ROOT_DIR, 'index.js');
const RECORDING_DIR = path.join(ROOT_DIR, 'kusho-tests', 'recordings');
const EXTENDED_DIR = path.join(ROOT_DIR, 'kusho-tests', 'extended-tests');

// ─── Artifact helpers ────────────────────────────────────────────────────────

function readArtifacts() {
  const toItems = (dir, type) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.js'))
      .map(file => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        return { type, file, fullPath, mtime: stats.mtime };
      });
  };

  const recordings = toItems(RECORDING_DIR, 'recording');
  const extended = toItems(EXTENDED_DIR, 'extended');
  return [...recordings, ...extended].sort((a, b) => b.mtime - a.mtime);
}

function runCommand(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code));
  });
}

// ─── Build select choices from artifacts ─────────────────────────────────────

function artifactChoices(artifacts) {
  if (artifacts.length === 0) {
    return [{ value: null, label: chalk.gray('(no artifacts yet)') }];
  }
  return artifacts.map(item => ({
    value: item,
    label: `${item.type === 'recording' ? chalk.blue('[R]') : chalk.green('[E]')} ${item.file}`,
    hint: item.type === 'recording' ? 'recording' : 'extended test',
  }));
}

// ─── Sub-menus ───────────────────────────────────────────────────────────────

async function pickAndRun(action, artifacts) {
  const choices = artifactChoices(artifacts);
  if (!choices[0].value) {
    clack.log.warn('No artifacts found. Record something first.');
    return;
  }

  const item = await clack.select({
    message: 'Select a file:',
    options: choices,
  });
  if (clack.isCancel(item)) return;

  const args = buildArgs(action, item);
  if (!args) {
    clack.log.warn(`Action "${action}" is not valid for a ${item.type} file.`);
    return;
  }

  clack.log.info(`Running: ${args.join(' ')}`);
  await runCommand(args);
}

function buildArgs(action, item) {
  switch (action) {
    case 'extend':
      return item.type === 'recording' ? ['extend', item.file] : null;
    case 'edit':
      return item.type === 'extended' ? ['edit', item.file] : null;
    case 'run':
      return item.type === 'extended' ? ['run', item.file] : null;
    case 'run-headed':
      return item.type === 'extended' ? ['run', item.file, '--headed'] : null;
    case 'run-recording':
      return item.type === 'recording' ? ['run-recording', item.file] : null;
    default:
      return null;
  }
}

// ─── Main TUI loop ────────────────────────────────────────────────────────────

async function startTUI() {
  clack.intro(chalk.bold.cyan('⚡ Kusho Interactive UI'));

  while (true) {
    // Refresh artifact list on each iteration
    const artifacts = readArtifacts();
    const recordingCount = artifacts.filter(a => a.type === 'recording').length;
    const extendedCount  = artifacts.filter(a => a.type === 'extended').length;

    clack.note(
      `Recordings: ${chalk.blue(recordingCount)}   Extended tests: ${chalk.green(extendedCount)}`,
      'Artifact summary'
    );

    const action = await clack.select({
      message: 'What would you like to do?',
      options: [
        {
          value: 'record',
          label: `${chalk.cyan('🎬 Record')}  new test`,
          hint: 'Opens Playwright codegen in browser',
        },
        {
          value: 'extend',
          label: `${chalk.yellow('📋 Extend')}  a recording → generate test cases`,
          hint: 'Pick a [R] recording to expand with AI',
        },
        {
          value: 'edit',
          label: `${chalk.magenta('✨ Kusho Edit')}  generated tests`,
          hint: 'Refine an [E] extended test with plain-English instructions',
        },
        {
          value: 'run',
          label: `${chalk.green('▶  Run')}  extended test`,
          hint: 'Runs headless by default',
        },
        {
          value: 'run-headed',
          label: `${chalk.green('👁  Run headed')}  extended test`,
          hint: 'Browser window visible',
        },
        {
          value: 'run-recording',
          label: `${chalk.green('▶  Run recording')}  (raw recording)`,
          hint: 'Runs a [R] recording directly',
        },
        {
          value: 'credentials',
          label: `${chalk.gray('🔑 Update')}  credentials`,
          hint: 'Change your LLM provider / API key',
        },
        {
          value: 'demo',
          label: `${chalk.gray('🎭 Demo')}  try with a sample app`,
          hint: 'Runs Playwright codegen on demo.playwright.dev/todomvc',
        },
        {
          value: 'quit',
          label: chalk.red('✗  Quit'),
        },
      ],
    });

    if (clack.isCancel(action) || action === 'quit') {
      clack.outro(chalk.green('Goodbye! 👋'));
      process.exit(0);
    }

    if (action === 'record') {
      clack.log.info('Starting Playwright recorder…');
      await runCommand(['record']);
    } else if (action === 'credentials') {
      await runCommand(['credentials']);
    } else if (action === 'demo') {
      clack.log.info('Launching demo on demo.playwright.dev/todomvc…');
      await runCommand(['demo']);
    } else {
      await pickAndRun(action, artifacts);
    }

    // Small separator before looping back
    console.log('');
  }
}

module.exports = { startTUI };
