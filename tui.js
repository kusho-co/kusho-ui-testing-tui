const blessed = require('blessed');
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
      .map((file) => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        return { type, file, fullPath, mtime: stats.mtime };
      });
  };

  const recordings = toItems(RECORDING_DIR, 'recording');
  const extended = toItems(EXTENDED_DIR, 'extended');
  const all = [...recordings, ...extended].sort((a, b) => b.mtime - a.mtime);
  return all;
}

function runCommand(screen, args, onDone) {
  screen.destroy();
  const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  child.on('close', (code) => {
    onDone(`Command finished (${code === 0 ? 'ok' : `exit ${code}`})`);
  });
}

function startTUI(statusMessage = 'UI ready.') {
  const state = {
    artifacts: [],
  };

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Kusho UI',
  });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: true,
    content: '{bold}Kusho Interactive UI{/bold} - Enter: file path - a: refresh - q: quit',
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
  });

  const listPane = blessed.list({
    top: 3,
    left: 0,
    width: '45%',
    height: '72%',
    label: ' Artifacts (recordings + extended tests) ',
    border: { type: 'line' },
    keys: true,
    mouse: true,
    vi: true,
    style: {
      border: { fg: 'blue' },
      selected: { bg: 'blue' },
    },
  });

  const logPane = blessed.log({
    top: 3,
    left: '45%',
    width: '55%',
    height: '72%',
    label: ' Activity ',
    border: { type: 'line' },
    tags: true,
    scrollback: 400,
    alwaysScroll: true,
    style: { border: { fg: 'green' } },
  });

  const footer = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: '28%',
    label: ' Actions ',
    border: { type: 'line' },
    style: { border: { fg: 'magenta' } },
    content: [
      'r: record flow',
      'e: extend selected recording (or latest)',
      't: run selected extended test (or latest)',
      'y: run selected recording (or latest)',
      'h: run headed selected/latest extended test',
      'c: update credentials',
      'd: run demo',
      'a: refresh artifact list',
      'q: quit',
    ].join('\n'),
  });

  function refreshArtifacts() {
    state.artifacts = readArtifacts();
    const rows = state.artifacts.length === 0
      ? ['(no artifacts yet)']
      : state.artifacts.map(item => `${item.type === 'recording' ? '[R]' : '[E]'} ${item.file}`);
    listPane.setItems(rows);
    screen.render();
  }

  function selectedArtifact() {
    const idx = listPane.selected;
    if (idx == null || idx < 0 || idx >= state.artifacts.length) return null;
    return state.artifacts[idx];
  }

  function execute(args, label) {
    logPane.log(`{cyan-fg}Running:{/cyan-fg} ${label}`);
    screen.render();
    runCommand(screen, args, (result) => startTUI(`${label} -> ${result}`));
  }

  function actionExtend() {
    const item = selectedArtifact();
    if (item && item.type === 'recording') {
      execute(['extend', item.file], `extend ${item.file}`);
      return;
    }
    execute(['extend', 'latest'], 'extend latest');
  }

  function actionRunExtended(headed = false) {
    const item = selectedArtifact();
    const args = ['run'];
    if (item && item.type === 'extended') {
      args.push(item.file);
    } else {
      args.push('latest');
    }
    if (headed) args.push('--headed');
    execute(args, args.join(' '));
  }

  function actionRunRecording() {
    const item = selectedArtifact();
    if (item && item.type === 'recording') {
      execute(['run-recording', item.file], `run-recording ${item.file}`);
      return;
    }
    execute(['run-recording', 'latest'], 'run-recording latest');
  }

  listPane.on('select', () => {
    const item = selectedArtifact();
    if (!item) return;
    logPane.log(`{green-fg}Selected:{/green-fg} ${item.file} (${item.type})`);
  });

  screen.append(header);
  screen.append(listPane);
  screen.append(logPane);
  screen.append(footer);

  logPane.log(`{green-fg}${statusMessage}{/green-fg}`);
  logPane.log('Choose file and press action key.');

  screen.key(['q', 'C-c'], () => process.exit(0));
  screen.key(['a'], () => {
    refreshArtifacts();
    logPane.log('{blue-fg}Artifacts refreshed{/blue-fg}');
  });
  screen.key(['enter'], () => {
    const item = selectedArtifact();
    if (!item) {
      logPane.log('{yellow-fg}No file selected{/yellow-fg}');
      return;
    }
    logPane.log(`Path: ${item.fullPath}`);
  });
  screen.key(['r'], () => execute(['record'], 'record'));
  screen.key(['e'], () => actionExtend());
  screen.key(['t'], () => actionRunExtended(false));
  screen.key(['h'], () => actionRunExtended(true));
  screen.key(['y'], () => actionRunRecording());
  screen.key(['c'], () => execute(['credentials'], 'credentials'));
  screen.key(['d'], () => execute(['demo'], 'demo'));

  refreshArtifacts();
  listPane.focus();
  screen.render();
}

module.exports = { startTUI };
