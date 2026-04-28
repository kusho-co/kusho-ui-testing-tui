const { clack } = require('./ui');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const spawn = require('cross-spawn');

const ROOT_DIR = __dirname;
const CLI_ENTRY = path.join(ROOT_DIR, 'index.js');
const RECORDING_DIR = path.join(ROOT_DIR, 'kusho-tests', 'recordings');
const EXTENDED_DIR = path.join(ROOT_DIR, 'kusho-tests', 'extended-tests');

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

/**
 * Ask for optional record arguments: URL, device, viewport, target, output, wait-enhancement.
 * Returns an array of CLI args to append.
 * Returns null if the user cancelled.
 */
async function promptRecordArgs() {
  const url = await clack.text({
    message: 'Start URL  (optional — press Enter to open a blank browser):',
    placeholder: 'https://your-app.com',
    initialValue: '',
  });
  if (clack.isCancel(url)) return null;

  const wantAdvanced = await clack.confirm({
    message: 'Configure advanced options?',
    initialValue: false,
  });
  if (clack.isCancel(wantAdvanced)) return null;

  const args = [];
  if (url && url.trim()) args.push(url.trim());

  if (wantAdvanced) {
    // Device emulation
    const device = await clack.text({
      message: 'Device to emulate  (optional):',
      placeholder: 'e.g. iPhone 13, Pixel 5 — press Enter to skip',
      initialValue: '',
    });
    if (clack.isCancel(device)) return null;
    if (device && device.trim()) args.push('--device', device.trim());

    // Only offer viewport override when no device is selected
    // (device emulation sets its own native resolution automatically)
    if (!device || !device.trim()) {
      const viewport = await clack.text({
        message: 'Viewport size  (optional):',
        placeholder: 'e.g. 1280,720 — press Enter for default (1280,720)',
        initialValue: '',
      });
      if (clack.isCancel(viewport)) return null;
      if (viewport && viewport.trim()) args.push('--viewport', viewport.trim());
    }

    // Target language
    const target = await clack.select({
      message: 'Target language for generated code:',
      options: [
        { value: 'javascript', label: 'JavaScript', hint: 'default' },
        { value: 'typescript', label: 'TypeScript' },
        { value: 'python', label: 'Python' },
        { value: 'python-async', label: 'Python (async)' },
        { value: 'python-pytest', label: 'Python (pytest)' },
        { value: 'java', label: 'Java' },
        { value: 'csharp', label: 'C#' },
      ],
      initialValue: 'javascript',
    });
    if (clack.isCancel(target)) return null;
    if (target !== 'javascript') args.push('--target', target);

    // Custom output filename
    const output = await clack.text({
      message: 'Output filename  (optional — leave blank to name it after recording):',
      placeholder: 'e.g. my-login-flow.js',
      initialValue: '',
    });
    if (clack.isCancel(output)) return null;
    if (output && output.trim()) args.push('--output', output.trim());

    // Wait enhancement toggle
    clack.log.info(
      'Intelligent wait enhancement automatically inserts smart pauses after\n' +
      '    clicks, navigations, and form interactions to make generated tests\n' +
      '    more reliable. Disable only if you want to manage waits manually.'
    );
    const disableWait = await clack.confirm({
      message: 'Disable intelligent wait enhancement?',
      initialValue: false,
    });
    if (clack.isCancel(disableWait)) return null;
    if (disableWait) args.push('--no-wait-enhancement');
  }

  return args;
}

/**
 * Ask for run-mode options: headed/headless + optional video recording.
 * Returns an array of flag args to append, or null if cancelled.
 */
async function promptRunOptions() {
  const mode = await clack.select({
    message: 'Run mode:',
    options: [
      { value: 'headless', label: chalk.cyan('🔍 Headless'), hint: 'default — no browser window' },
      { value: 'headed', label: chalk.green('👁  Headed'), hint: 'browser window visible' },
    ],
  });
  if (clack.isCancel(mode)) return null;

  const recordVideo = await clack.confirm({
    message: 'Record video + trace for this run?',
    initialValue: false,
  });
  if (clack.isCancel(recordVideo)) return null;

  const args = [];
  if (mode === 'headed') args.push('--headed');
  if (recordVideo) args.push('--record');
  return args;
}

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

async function pickAndRun(action, artifacts) {
  // Only show files that are valid for the chosen action
  const typeFilter = {
    'run': 'extended',
    'run-recording': 'recording',
    'extend': 'recording',
    'edit': 'extended',
  };
  const filtered = typeFilter[action]
    ? artifacts.filter(a => a.type === typeFilter[action])
    : artifacts;

  const choices = artifactChoices(filtered);
  if (!choices[0].value) {
    const label = typeFilter[action] === 'recording' ? 'recordings' : 'extended tests';
    clack.log.warn(`No ${label} found. ${typeFilter[action] === 'recording' ? 'Run \'Record\' first.' : 'Run \'Extend\' on a recording first.'}`);
    return;
  }

  const item = await clack.select({
    message: 'Select a file:',
    options: choices,
  });
  if (clack.isCancel(item)) return;

  // Collect run options for actions that support them
  let extraArgs = [];
  if (action === 'run' || action === 'run-recording') {
    const opts = await promptRunOptions();
    if (opts === null) return;   // user cancelled
    extraArgs = opts;
  }

  const baseArgs = buildBaseArgs(action, item);
  if (!baseArgs) {
    clack.log.warn(`"${action}" is not valid for a ${item.type} file.`);
    return;
  }

  const finalArgs = [...baseArgs, ...extraArgs];
  clack.log.info(`Running: kusho ${finalArgs.join(' ')}`);
  await runCommand(finalArgs);
}

function buildBaseArgs(action, item) {
  switch (action) {
    case 'extend':
      return item.type === 'recording' ? ['extend', item.file] : null;
    case 'edit':
      return item.type === 'extended' ? ['edit', item.file] : null;
    case 'run':
      return item.type === 'extended' ? ['run', item.file] : null;
    case 'run-recording':
      return item.type === 'recording' ? ['run-recording', item.file] : null;
    default:
      return null;
  }
}

async function startTUI() {
  clack.intro(chalk.bold.cyan('⚡ Kusho Interactive UI'));

  while (true) {
    const artifacts = readArtifacts();
    const recordingCount = artifacts.filter(a => a.type === 'recording').length;
    const extendedCount = artifacts.filter(a => a.type === 'extended').length;

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
          hint: 'Opens Playwright codegen — you\'ll set URL / device next',
        },
        {
          value: 'extend',
          label: `${chalk.yellow('📋 Extend')}  a recording → generate test cases`,
          hint: 'Pick a [R] recording to expand with AI',
        },
        {
          value: 'edit',
          label: `${chalk.magenta('✨ Kusho Edit')}  an extended test`,
          hint: 'Refine an [E] extended test with plain-English instructions',
        },
        {
          value: 'run',
          label: `${chalk.green('▶  Run')}  extended test`,
          hint: 'Pick a file, then choose headless / headed',
        },
        {
          value: 'run-recording',
          label: `${chalk.green('▶  Run recording')}  (raw recording)`,
          hint: 'Pick a [R] file, then choose headless / headed',
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
      const recordArgs = await promptRecordArgs();
      if (recordArgs === null) {
        clack.log.warn('Record cancelled.');
      } else {
        clack.log.info(`Starting recorder${recordArgs.length ? ` with: ${recordArgs.join(' ')}` : '…'}`);
        await runCommand(['record', ...recordArgs]);
      }

    } else if (action === 'credentials') {
      await runCommand(['credentials']);

    } else if (action === 'demo') {
      clack.log.info('Launching demo on demo.playwright.dev/todomvc…');
      await runCommand(['demo']);

    } else {
      await pickAndRun(action, artifacts);
    }

    console.log('');
  }
}

module.exports = { startTUI };
