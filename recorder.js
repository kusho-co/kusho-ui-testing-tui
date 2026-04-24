const spawn = require("cross-spawn");
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Select } = require('enquirer');
const WaitEnhancer = require('./wait-enhancer');
const LLMClient = require('./llm-client');
const { DEFAULT_MODELS } = require('./llm-client');
const ui = require('./ui');
const { clack } = require('./ui');

const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'gemini'];

class KushoRecorder {
  constructor() {
    this.testsDir = path.join(__dirname, 'kusho-tests');
    this.outputFile = path.join(this.testsDir, 'recordings', 'generated-test.js');
    this.recordingDir = path.join(this.testsDir, 'recordings');
    this.extendedDir = path.join(this.testsDir, 'extended-tests');
    this.codegenProcess = null;
    this.watcher = null;
    this.onCodeUpdate = null;
    this.currentCode = '';
    this.waitEnhancer = new WaitEnhancer();
    this.enableWaitEnhancement = true;
    this.credentialsFile = path.join(process.env.HOME || process.env.USERPROFILE, '.kusho-credentials');
    this.instructions = '';
  }

  async startRecording(url = '', options = {}) {
    // Ensure recordings directory exists
    if (!fs.existsSync(this.recordingDir)) {
      fs.mkdirSync(this.recordingDir, { recursive: true });
    }

    // Clear previous recording
    if (fs.existsSync(this.outputFile)) {
      fs.unlinkSync(this.outputFile);
    }

    ui.info('Starting KushoAI recorder...');

    const args = [
      'playwright',
      'codegen',
      '--output', this.outputFile,
      '--target', options.target || 'javascript',
      '--viewport-size', options.viewport || '1280,720'
    ];

    // Add device emulation if specified
    if (options.device) {
      args.push('--device', options.device);
    }

    // Add URL if provided
    if (url) {
      args.push(url);
    }

    // Start codegen process
    this.codegenProcess = spawn('npx', args, {
      stdio: 'inherit',
      shell: true
    });

    // Handle process events
    this.codegenProcess.on('error', (error) => {
      ui.error(`Failed to start recorder: ${error.message}`);
    });

    this.codegenProcess.on('close', (code) => {
      this.stopWatching();
      this.promptForFilename();
    });

    // Start watching for file changes
    this.watchForChanges();

    return new Promise((resolve) => {
      // Wait a bit for the process to start
      setTimeout(() => {
        ui.success('KushoAI recorder started! Interact with browser to generate code.');
        resolve();
      }, 2000);
    });
  }

  watchForChanges() {
    // Poll for file existence first
    const checkFile = () => {
      if (fs.existsSync(this.outputFile)) {
        this.startFileWatcher();
      } else {
        setTimeout(checkFile, 500);
      }
    };

    checkFile();
  }

  startFileWatcher() {

    this.watcher = fs.watch(this.outputFile, (eventType) => {
      if (eventType === 'change') {
        try {
          const newCode = fs.readFileSync(this.outputFile, 'utf8');

          // Only process if code actually changed
          if (newCode !== this.currentCode) {
            this.currentCode = newCode;
            this.handleCodeUpdate(newCode);
          }
        } catch (error) {
          // File might be temporarily locked, ignore
        }
      }
    });
  }

  handleCodeUpdate(code) {
    // Enhance code with intelligent waits if enabled
    let finalCode = code;
    if (this.enableWaitEnhancement) {
      finalCode = this.waitEnhancer.enhanceCode(code);

      // Show suggestions
      const suggestions = this.waitEnhancer.analyzeAndSuggestWaits(code);
      if (suggestions.length > 0) {
        console.log(chalk.yellow('💡 Suggestions:'));
        suggestions.forEach(s => console.log(chalk.yellow(`  • ${s}`)));
      }
    }

    // Wrap code in a test function
    finalCode = this.wrapInTestFunction(finalCode);

    console.log(chalk.gray('─'.repeat(50)));
    console.log(finalCode);
    console.log(chalk.gray('─'.repeat(50)));

    // Update current code with enhanced version
    this.currentCode = finalCode;

    // Call user-defined callback if provided
    if (this.onCodeUpdate) {
      this.onCodeUpdate(finalCode);
    }
  }

  stopRecording() {

    if (this.codegenProcess) {
      this.codegenProcess.kill();
      this.codegenProcess = null;
    }

    this.stopWatching();

    // Return final code
    if (fs.existsSync(this.outputFile)) {
      return fs.readFileSync(this.outputFile, 'utf8');
    }

    return this.currentCode;
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  getCurrentCode() {
    return this.currentCode;
  }

  saveCodeToFile(filename) {
    const fullPath = path.join(this.recordingDir, filename);
    fs.writeFileSync(fullPath, this.currentCode);
    console.log(chalk.green(`💾 Code saved to: ${fullPath}`));
    return fullPath;
  }

  // Set callback for code updates
  onUpdate(callback) {
    this.onCodeUpdate = callback;
  }

  async promptForFilename() {
    if (!this.currentCode || this.currentCode.trim() === '') {
      ui.warning('No code to save.');
      return;
    }

    ui.success('Recording completed!');

    let filename = await clack.text({
      message: 'Give your recording a name (without extension):',
      placeholder: 'my-login-flow',
      validate: () => undefined, // always valid — we'll generate a name if blank
    });

    if (clack.isCancel(filename) || !filename || filename.trim() === '') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `kusho-test-${timestamp}`;
      clack.log.info(`Using auto-generated name: ${filename}`);
    }

    // Ensure .test.js extension for Playwright
    filename = filename.trim();
    if (!filename.endsWith('.test.js')) {
      filename = filename.endsWith('.js')
        ? filename.replace('.js', '.test.js')
        : filename + '.test.js';
    }

    const finalPath = this.saveCodeToUniqueFile(filename);
    ui.success(`Test saved!`);
    ui.info(`File: ${finalPath}`);

    // Open editor for user to edit the file
    this.openEditorInTerminal(finalPath);
  }

  saveCodeToUniqueFile(filename) {
    let counter = 1;
    let baseName = filename.replace('.test.js', '');
    let finalFilename = filename;
    let fullPath = path.join(this.recordingDir, finalFilename);

    // Check if file exists and create unique name
    while (fs.existsSync(fullPath)) {
      finalFilename = `${baseName}-${counter}.test.js`;
      fullPath = path.join(this.recordingDir, finalFilename);
      counter++;
    }

    fs.writeFileSync(fullPath, this.currentCode);

    return fullPath;
  }

  openEditorInTerminal(filePath) {
    ui.info('Opening editor...');
    console.log(chalk.gray('Press Ctrl+X to exit nano, or :wq to exit vim'));

    // Try terminal-based editors in order of preference
    const terminalEditors = ['vim', 'nano', 'vi'];

    this.tryTerminalEditor(filePath, terminalEditors, 0);
  }

  tryTerminalEditor(filePath, editors, index) {
    if (index >= editors.length) {
      ui.warning('No terminal editor found');
      ui.hint(`You can manually edit: ${filePath}`);
      return;
    }

    const editor = editors[index];
    const editorProcess = spawn(editor, [filePath], {
      stdio: 'inherit'  // This allows the editor to take control of the terminal
    });

    editorProcess.on('error', (error) => {
      // Try next editor if current one fails
      this.tryTerminalEditor(filePath, editors, index + 1);
    });

    editorProcess.on('close', async (code) => {
      if (code === 0) {
        ui.success('File edited successfully!');

        // Prominently prompt for generation instructions
        const instructions = await clack.text({
          message: 'Any instructions for generating test variations?',
          placeholder: 'e.g. focus on error cases, use auth token X, test empty fields…',
          initialValue: '',
        });

        const finalInstructions = clack.isCancel(instructions) ? '' : (instructions || '').trim();
        if (finalInstructions) {
          clack.log.info(`Instructions noted: ${finalInstructions}`);
        } else {
          clack.log.info('No instructions — using smart defaults.');
        }

        this.extendScriptWithAPI(filePath, finalInstructions);
      } else {
        ui.warning('Editor exited with errors while saving recording.');
      }
    });
  }

  async getCredentials() {
    try {
      if (fs.existsSync(this.credentialsFile)) {
        const data = fs.readFileSync(this.credentialsFile, 'utf8');
        const creds = JSON.parse(data);

        // Detect old format { email, token } from the hosted backend era
        if (creds.email || creds.token) {
          console.log(chalk.yellow('⚠️  Your saved credentials use the old format (email/token).'));
          console.log(chalk.blue('🔄 Please re-configure with your LLM provider API key.'));
          return await this.promptForCredentials();
        }

        if (creds.provider && creds.apiKey) {
          return creds;
        }
      }
    } catch (error) {
      ui.warning('Error reading credentials file');
    }

    return await this.promptForCredentials();
  }

  async promptForCredentials() {
    clack.intro(chalk.bold.cyan('🔐 Configure LLM Provider'));
    clack.log.info('Your API key is stored locally in ~/.kusho-credentials and never sent anywhere except your chosen provider.');

    // Step 1: Choose provider
    const providerChoice = await clack.select({
      message: 'Choose your LLM provider:',
      options: [
        { value: 'openai', label: 'OpenAI', hint: `default model: ${DEFAULT_MODELS.openai}` },
        { value: 'anthropic', label: 'Anthropic', hint: `default model: ${DEFAULT_MODELS.anthropic}` },
        { value: 'gemini', label: 'Gemini', hint: `default model: ${DEFAULT_MODELS.gemini}` },
      ],
    });
    if (clack.isCancel(providerChoice)) throw new Error('Credentials setup cancelled.');
    const provider = providerChoice;

    // Step 2: API key
    const providerLabel = provider === 'openai' ? 'OpenAI' : provider.charAt(0).toUpperCase() + provider.slice(1);
    const apiKey = (await ask(chalk.cyan(`🔑 Enter your ${providerLabel} API key: `))).trim();
    if (!apiKey) {
      rl.close();
      throw new Error('API key cannot be empty');
    }

    // Step 3: Optional model override
    const defaultModel = DEFAULT_MODELS[provider];
    const modelInput = await clack.text({
      message: 'Model override (press Enter for default):',
      placeholder: defaultModel,
      initialValue: '',
    });
    const model = (!clack.isCancel(modelInput) && modelInput && modelInput.trim())
      ? modelInput.trim()
      : defaultModel;

    const credentials = { provider, apiKey: apiKey.trim(), model };

    // Validate API key before saving — fail fast like backend validate_config()
    console.log(chalk.blue(`\n🔍 Validating ${providerLabel} API key...`));
    try {
      const llm = new LLMClient(credentials);
      const result = await llm.validateCredentials();
      if (!result.valid) {
        s.stop(chalk.red(`❌ Invalid API key: ${result.error}`));
        clack.log.warn('Please try again with a valid API key.');
        return await this.promptForCredentials();
      }
      s.stop(chalk.green('✅ API key valid!'));
    } catch (error) {
      s.stop(chalk.red(`❌ Could not validate API key: ${error.message}`));
      clack.log.warn('Please try again with a valid API key.');
      return await this.promptForCredentials();
    }

    try {
      fs.writeFileSync(this.credentialsFile, JSON.stringify(credentials, null, 2));
      console.log(chalk.green(`✅ Credentials saved! Using ${providerLabel} / ${model}`));
    } catch (error) {
      ui.warning('Could not save credentials to file.');
    }

    return credentials;
  }

  async promptForNewFilename(currentFilename) {
    console.log(chalk.blue('📝 Please provide a new filename for the extended test'));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(chalk.cyan(`💾 Enter new filename (current: ${currentFilename}): `), (newFilename) => {
        rl.close();

        if (!newFilename || newFilename.trim() === '') {
          resolve(null); // User wants to cancel
          return;
        }

        let finalFilename = newFilename.trim();

        // Ensure .test.js extension if the original had it
        if (currentFilename.endsWith('.test.js') && !finalFilename.endsWith('.test.js')) {
          if (finalFilename.endsWith('.js')) {
            finalFilename = finalFilename.replace('.js', '.test.js');
          } else {
            finalFilename += '.test.js';
          }
        } else if (currentFilename.endsWith('.js') && !finalFilename.endsWith('.js')) {
          finalFilename += '.js';
        }

        // Check if the new filename also exists
        const newPath = path.join(this.extendedDir, finalFilename);
        if (fs.existsSync(newPath)) {
          console.log(chalk.red(`❌ File ${finalFilename} also exists. Please choose a different name.`));
          resolve(null);
        } else {
          resolve(finalFilename);
        }
      });
    });
  }

  async extendScriptWithAPI(filePath, instructions = '') {
    ui.section('Extend Script');
    ui.info('Extending script with KushoAI...');

    try {
      const credentials = await this.getCredentials();
      const llm = new LLMClient(credentials);
      const currentContent = fs.readFileSync(filePath, 'utf8');

      // Step 1: Generate test cases
      const testCases = await this.generateTestCases(currentContent, llm, instructions);

      // Step 2: Let user edit test cases
      const editedTestCases = await this.editTestCases(testCases);

      // Step 3: Generate extended script
      const extendedScript = await this.generateExtendedScript(currentContent, editedTestCases, llm, instructions);

      // Save to extended-tests folder
      let extendedFilePath = this.createExtendedFilePath(filePath);

      if (fs.existsSync(extendedFilePath)) {
        const currentFilename = path.basename(extendedFilePath);
        console.log(chalk.yellow(`⚠️  File already exists: ${currentFilename}`));
        const newFilename = await this.promptForNewFilename(currentFilename);
        if (newFilename) {
          extendedFilePath = path.join(this.extendedDir, newFilename);
        } else {
          console.log(chalk.red('❌ Extension cancelled'));
          return;
        }
      }

      fs.writeFileSync(extendedFilePath, extendedScript);

      console.log(chalk.green('\n🎉 Script extended successfully!'));
      console.log(chalk.blue(`📁 Original file preserved: ${filePath}`));
      console.log(chalk.blue(`📁 Extended script saved:   ${extendedFilePath}`));
      console.log(chalk.gray('💡 Tip: Use `kusho edit` to make further changes to the generated script.'));

    } catch (error) {
      ui.error(`Error extending script: ${error.message}`);
      ui.info(`Original file preserved: ${filePath}`);
    }
  }

  async generateTestCases(scriptContent, llm, instructions = '') {
    const handle = this.showLoadingIndicator('Analyzing script and generating test cases…');
    try {
      const testCases = await llm.generateTestCases(scriptContent, instructions);
      this._stopSpinner(handle, chalk.green('✅ Test cases generated!'));
      return testCases;
    } catch (error) {
      this._stopSpinner(handle, chalk.red('❌ Test case generation failed.'));
      throw error;
    }
  }

  async editTestCases(testCases) {
    console.log(chalk.blue('📝 Opening test cases for review...'));

    // Create temporary file for test cases
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempFile = path.join(tempDir, `test-cases-${timestamp}.txt`);

    // Write test cases to temp file
    fs.writeFileSync(tempFile, testCases);

    console.log(chalk.yellow('💡 Review and edit the test cases. Save and exit when done.'));
    console.log(chalk.gray('Each line represents a test case to be generated.'));

    // Open editor for test cases
    await this.openEditorForFile(tempFile);

    // Read edited test cases
    const editedTestCases = fs.readFileSync(tempFile, 'utf8');

    // Clean up temp file
    fs.unlinkSync(tempFile);

    console.log(chalk.green('✅ Test cases reviewed and saved!'));
    return editedTestCases;
  }

  async generateExtendedScript(originalScript, testCases, llm, instructions = '') {
    const handle = this.showLoadingIndicator('Creating test variations…');
    try {
      const extendedScript = await llm.generateTestScripts(originalScript, testCases, instructions);
      this._stopSpinner(handle, chalk.green('✅ Extended script generated!'));
      return extendedScript;
    } catch (error) {
      this._stopSpinner(handle, chalk.red('❌ Script generation failed.'));
      throw error;
    }
  }

  showLoadingIndicator(message = 'Kusho is thinking…') {
    const s = clack.spinner();
    s.start(message);
    // Return a fake interval handle so callers can still call clearInterval(handle)
    // without errors — actual stopping is done via s.stop() after the await.
    // We store the spinner on `this` so callers can stop it properly.
    this._activeSpinner = s;
    return { _clackSpinner: s };
  }

  _stopSpinner(handle, message) {
    if (handle && handle._clackSpinner) {
      handle._clackSpinner.stop(message || '');
    }
    this._activeSpinner = null;
  }

  async openEditorForFile(filePath) {
    ui.info('Opening editor...');
    console.log(chalk.gray('Press Ctrl+X to exit nano, or :wq to exit vim'));

    // Try terminal-based editors in order of preference
    const terminalEditors = ['vim', 'nano', 'vi'];

    return new Promise((resolve, reject) => {
      this.tryTerminalEditorForFile(filePath, terminalEditors, 0, resolve, reject);
    });
  }

  tryTerminalEditorForFile(filePath, editors, index, resolve, reject) {
    if (index >= editors.length) {
      reject(new Error('No terminal editor found'));
      return;
    }

    const editor = editors[index];
    const editorProcess = spawn(editor, [filePath], {
      stdio: 'inherit'  // This allows the editor to take control of the terminal
    });

    editorProcess.on('error', (error) => {
      // Try next editor if current one fails
      this.tryTerminalEditorForFile(filePath, editors, index + 1, resolve, reject);
    });

    editorProcess.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ File edited successfully!'));
        resolve();
      } else {
        reject(new Error('Editor exited with errors while saving tests'));
      }
    });
  }

  async callTestCasesAPI(scriptContent, credentials, instructions = '') {
    const llm = new LLMClient(credentials);
    return llm.generateTestCases(scriptContent, instructions);
  }

  async callGenerateScriptAPI(originalScript, testCases, credentials, instructions = '') {
    const llm = new LLMClient(credentials);
    const script = await llm.generateTestScripts(originalScript, testCases, instructions);
    return { extended_script: script, remaining_generations: null };
  }

  async callEditScriptAPI(script, instruction, credentials) {
    const llm = new LLMClient(credentials);
    const editedScript = await llm.editTestScript(script, instruction);
    return { edited_script: editedScript, remaining_generations: null };
  }

  async postGenerationEditLoop(filePath, llm) {
    clack.note(
      `File: ${chalk.cyan(filePath)}\n` +
      `Type a change in plain English, or leave blank / press Enter to finish.\n` +
      `Examples: ${chalk.gray('"add assertions for the page title"')} · ${chalk.gray('"add error case for empty password"')}`,
      '✨ Kusho Edit  —  refine your tests with AI'
    );

    while (true) {
      const instruction = await clack.text({
        message: 'Edit instruction:',
        placeholder: 'Press Enter with no text to finish',
      });

      const val = clack.isCancel(instruction) ? '' : (instruction || '').trim();

      if (!val || val.toLowerCase() === 'done' || val.toLowerCase() === 'exit') {
        ui.success('Finished! Your tests are ready.');
        clack.log.info(`Final file: ${filePath}`);
        break;
      }

      const handle = this.showLoadingIndicator(`Applying: "${val}"…`);
      try {
        const currentScript = fs.readFileSync(filePath, 'utf8');
        const editedScript = await llm.editTestScript(currentScript, val);
        this._stopSpinner(handle, chalk.green('✅ Edit applied!'));
        fs.writeFileSync(filePath, editedScript);
      } catch (error) {
        this._stopSpinner(handle, chalk.red(`❌ Edit failed: ${error.message}`));
        clack.log.warn('File was not modified. Try a different instruction.');
      }
    }
  }

  async updateCredentials() {
    console.log(chalk.blue('🔐 Configure LLM provider credentials'));
    const credentials = await this.promptForCredentials();
    return credentials;
  }

  async editExtendedScript(filePath) {
    console.log(chalk.blue(`\n✏️  Editing extended script: ${filePath}`));
    try {
      const credentials = await this.getCredentials();
      const llm = new LLMClient(credentials);
      await this.postGenerationEditLoop(filePath, llm);
    } catch (error) {
      console.log(chalk.red('❌ Error editing script:'), error.message);
    }
  }

  wrapInTestFunction(code) {
    // Check if code is already wrapped in a test function
    if (code.includes('test(') || code.includes('describe(')) {
      return code;
    }

    // Extract the main functionality (skip imports and setup)
    const lines = code.split('\n');
    let testStartIndex = 0;
    let imports = '';
    let setup = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.startsWith('const ') || line.startsWith('require(')) {
        imports += lines[i] + '\n';
        testStartIndex = i + 1;
      } else if (line.includes('test =') || line.includes('browser =') || line.includes('context =')) {
        setup += lines[i] + '\n';
        testStartIndex = i + 1;
      } else if (line.length > 0) {
        break;
      }
    }

    const testCode = lines.slice(testStartIndex).join('\n');

    // Create wrapped test function
    const wrappedCode = `${imports}
const { test, expect } = require('@playwright/test');

test('KushoAI Generated Test', async ({ page }) => {
${testCode.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n')}
});`;

    return wrappedCode;
  }

  createExtendedFilePath(originalPath) {
    // Ensure extended-tests directory exists
    if (!fs.existsSync(this.extendedDir)) {
      fs.mkdirSync(this.extendedDir, { recursive: true });
    }

    const ext = path.extname(originalPath);
    const baseName = path.basename(originalPath, ext);

    // Handle both .js and .test.js extensions, preserve original filename
    if (originalPath.endsWith('.test.js')) {
      const nameWithoutTestExt = baseName.replace(/\.test$/, '');
      return path.join(this.extendedDir, `${nameWithoutTestExt}.test.js`);
    } else {
      return path.join(this.extendedDir, `${baseName}${ext}`);
    }
  }

  getLatestRecording() {
    try {
      if (!fs.existsSync(this.recordingDir)) {
        return null;
      }

      const files = fs.readdirSync(this.recordingDir)
        .filter(file => file.endsWith('.test.js') || file.endsWith('.js'))
        .map(file => {
          const filePath = path.join(this.recordingDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            mtime: stats.mtime
          };
        })
        .sort((a, b) => b.mtime - a.mtime);

      return files.length > 0 ? files[0].path : null;
    } catch (error) {
      return null;
    }
  }

  async runTest(filePath, options = {}) {
    console.log(chalk.blue('🧪 Running Playwright test...'));
    console.log(chalk.gray(`📁 File: ${filePath}`));

    // Check if file needs to be wrapped in test function
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('test(') && !content.includes('describe(')) {
      console.log(chalk.yellow('⚠️  File is not in test format, converting...'));
      const wrappedContent = this.wrapInTestFunction(content);
      fs.writeFileSync(filePath, wrappedContent);
      console.log(chalk.green('✅ File converted to test format'));
    }

    // Determine which project to use based on file path and options
    const project = this.getProjectName(filePath, options);

    // Use relative path to file within the project directory
    const relativePath = this.getRelativePathForProject(filePath, project);
    const args = ['playwright', 'test', `--project=${project}`, relativePath];

    // Add headed/headless option
    if (options.headed) {
      args.push('--headed');
      console.log(chalk.cyan('👁️  Running in headed mode (browser visible)'));
    } else {
      console.log(chalk.cyan('🔍 Running in headless mode'));
    }

    // Show recording info if enabled
    if (options.record) {
      console.log(chalk.magenta('🎥 Recording test run (video + trace)'));
      const testResultsDir = path.join(process.cwd(), 'test-results');
      console.log(chalk.gray(`📁 Results will be saved to: ${testResultsDir}`));
    }

    // Use the configured HTML reporter from playwright.config.js
    // (removing --reporter=line override to allow HTML report generation)

    console.log(chalk.gray(`🚀 Using project: ${project}`));

    return new Promise((resolve, reject) => {
      const testProcess = spawn('npx', args, {
        stdio: 'inherit',
        cwd: process.cwd() // Ensure we're in the right directory
      });

      testProcess.on('error', (error) => {
        reject(new Error(`Failed to run test: ${error.message}`));
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ Test completed successfully!'));
          if (options.record) {
            this.showRecordingResults();
          }
          resolve();
        } else {
          console.log(chalk.yellow(`⚠️  Test finished with exit code: ${code}`));
          if (options.record) {
            this.showRecordingResults();
          }
          resolve(); // Don't reject, as test failures are normal
        }
      });
    });
  }

  getProjectName(filePath, options) {
    const isRecording = filePath.includes(path.join('kusho-tests', 'recordings'));
    const isExtended = filePath.includes(path.join('kusho-tests', 'extended-tests'));

    if (isRecording) {
      return options.record ? 'recordings-record' : 'recordings';
    } else if (isExtended) {
      return options.record ? 'extended-record' : 'extended';
    } else {
      // Fallback for files outside standard directories
      return options.record ? 'recordings-record' : 'recordings';
    }
  }

  getRelativePathForProject(filePath, project) {
    // Get just the filename since project configs specify testDir
    return path.basename(filePath);
  }

  showRecordingResults() {
    const testResultsDir = path.join(process.cwd(), 'test-results');

    if (fs.existsSync(testResultsDir)) {
      console.log(chalk.green('📹 Test recording completed!'));
      console.log(chalk.blue('🔍 View results:'));

      // Find trace files
      const traceFiles = fs.readdirSync(testResultsDir, { recursive: true })
        .filter(file => file.toString().endsWith('.zip'))
        .slice(0, 3); // Show only latest 3

      traceFiles.forEach(file => {
        console.log(chalk.cyan(`  • npx playwright show-trace test-results/${file}`));
      });

      // Find video files
      const videoFiles = fs.readdirSync(testResultsDir, { recursive: true })
        .filter(file => file.toString().endsWith('.webm'))
        .slice(0, 3); // Show only latest 3

      if (videoFiles.length > 0) {
        console.log(chalk.blue('🎬 Video recordings:'));
        videoFiles.forEach(file => {
          console.log(chalk.cyan(`  • test-results/${file}`));
        });
      }
    }
  }

  getRecordingPath(filename) {
    // Handle different filename formats
    if (filename.endsWith('.test.js')) {
      return path.join(this.recordingDir, filename);
    } else if (filename.endsWith('.js')) {
      return path.join(this.recordingDir, filename);
    } else {
      // Try .test.js first, then .js
      const testPath = path.join(this.recordingDir, `${filename}.test.js`);
      if (fs.existsSync(testPath)) {
        return testPath;
      }
      return path.join(this.recordingDir, `${filename}.js`);
    }
  }

  getExtendedPath(filename) {
    // Handle different filename formats
    if (filename.endsWith('.test.js')) {
      return path.join(this.extendedDir, filename);
    } else if (filename.endsWith('.js')) {
      return path.join(this.extendedDir, filename);
    } else {
      // Try .test.js first, then .js
      const testPath = path.join(this.extendedDir, `${filename}.test.js`);
      if (fs.existsSync(testPath)) {
        return testPath;
      }
      return path.join(this.extendedDir, `${filename}.js`);
    }
  }

  listRecordings() {
    if (!fs.existsSync(this.recordingDir)) {
      console.log(chalk.gray('  No recordings folder found'));
      return;
    }

    const files = fs.readdirSync(this.recordingDir)
      .filter(file => file.endsWith('.test.js') || file.endsWith('.js'))
      .map(file => {
        const filePath = path.join(this.recordingDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          mtime: stats.mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime) // Sort by creation time (newest first)
      .map(item => item.name);

    if (files.length === 0) {
      console.log(chalk.gray('  No recordings found'));
    } else {
      files.forEach(file => {
        console.log(chalk.cyan(`  • ${file}`));
      });
    }
  }

  listExtendedTests() {
    if (!fs.existsSync(this.extendedDir)) {
      console.log(chalk.gray('  No extended-tests folder found'));
      return;
    }

    const files = fs.readdirSync(this.extendedDir)
      .filter(file => file.endsWith('.test.js') || file.endsWith('.js'))
      .map(file => {
        const filePath = path.join(this.extendedDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          mtime: stats.mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime) // Sort by creation time (newest first)
      .map(item => item.name);

    if (files.length === 0) {
      console.log(chalk.gray('  No extended tests found'));
    } else {
      files.forEach(file => {
        console.log(chalk.cyan(`  • ${file}`));
      });
    }
  }

  async chooseExtendedTest() {
    if (!fs.existsSync(this.extendedDir)) {
      console.log(chalk.red('❌ No extended-tests folder found'));
      return null;
    }

    const files = fs.readdirSync(this.extendedDir)
      .filter(file => file.endsWith('.test.js') || file.endsWith('.js'))
      .map(file => {
        const filePath = path.join(this.extendedDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          mtime: stats.mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime) // Sort by creation time (newest first)
      .map(item => item.name);

    if (files.length === 0) {
      console.log(chalk.red('❌ No extended tests found'));
      return null;
    }

    const prompt = new Select({
      name: 'extendedTest',
      message: 'Choose extended test',
      choices: [...files, 'latest'],
    });

    try {
      return await prompt.run();
    } catch (error) {
      ui.warning('Selection cancelled');
      return null;
    }
  }

  async chooseRecording() {
    if (!fs.existsSync(this.recordingDir)) {
      console.log(chalk.red('❌ No recordings folder found'));
      return null;
    }

    const files = fs.readdirSync(this.recordingDir)
      .filter(file => file.endsWith('.test.js') || file.endsWith('.js'))
      .map(file => {
        const filePath = path.join(this.recordingDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          mtime: stats.mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime) // Sort by creation time (newest first)
      .map(item => item.name);

    if (files.length === 0) {
      console.log(chalk.red('❌ No recordings found'));
      return null;
    }

    const prompt = new Select({
      name: 'recording',
      message: 'Choose recording',
      choices: [...files, 'latest'],
    });

    try {
      return await prompt.run();
    } catch (error) {
      ui.warning('Selection cancelled');
      return null;
    }
  }

  getLatestExtendedTest() {
    try {
      if (!fs.existsSync(this.extendedDir)) {
        return null;
      }

      const files = fs.readdirSync(this.extendedDir)
        .filter(file => file.endsWith('.test.js') || file.endsWith('.js'))
        .map(file => {
          const filePath = path.join(this.extendedDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            mtime: stats.mtime
          };
        })
        .sort((a, b) => b.mtime - a.mtime);

      return files.length > 0 ? files[0].path : null;
    } catch (error) {
      return null;
    }
  }

}

module.exports = KushoRecorder;