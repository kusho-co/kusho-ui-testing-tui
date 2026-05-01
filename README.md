# [KushoAI UI Testing TUI](https://github.com/kusho-co/kusho-ui-testing-tui/)

AI-powered TUI tool for recording UI interactions and generating comprehensive test suites.

KushoAI TUI is open source and lets you record a user flow once, then generate tests using your choice of LLM provider. It automatically expands that flow into multiple test cases covering different inputs, edge cases, and real-world scenarios—giving you deeper test coverage without repetitive manual work. Instead of writing tests one by one, you turn a single interaction into a full suite of intelligent, automated test cases.


[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/E1yqiloZCNw/0.jpg)](https://youtu.be/E1yqiloZCNw?si=2JC9XgEYGvSvEF5K)

## Prerequisites

### Node.js Installation (Node 18+)

Install Node.js using nvm (Node Version Manager):

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart your terminal or run:
source ~/.bashrc

# Install and use Node.js 18 or later
nvm install 18
nvm use 18

# Verify installation
node --version
npm --version
``` 

Please note that these instructions are for bash. The setup might differ a little bit for other terminals. 

You can alternatively download the binaries from [here](https://nodejs.org/en/download/) and install it.

### Git (Required)

Make sure Git is installed on your system. Git is essential for version control and helps in managing your project setup seamlessly. You can download it for free from the official Git [website](https://git-scm.com/downloads).

### Terminal Editor (Required)

A terminal editor is essential for editing test scripts during generation. Install one of the following:

#### Windows (PowerShell as Administrator)
```bash
# Install Vim
winget install vim.vim

# might need adding the vim program files to path and terminal restart before it starts working
```

#### macOS (Homebrew)
```bash
# Install Vim
brew install vim

# Check if nano is available (often pre-installed)
which nano
```

#### Linux (Ubuntu/Debian)
```bash
# Install Vim
sudo apt-get install vim

# Or install Nano
sudo apt-get install nano
```

#### Alternative Downloads
- [Vim for Windows](https://www.vim.org/download.php)
- [Nano for Windows](https://www.nano-editor.org/download.php)
- [Git for Windows](https://git-scm.com/download/win)

#### Test Your Installation
```bash
vim --version
# Or try: nano --version, vi --version
```

### Clone the Repository

```bash
git clone https://github.com/kusho-co/kusho-ui-testing-tui.git
cd kusho-ui-testing-tui
```

## Installation

```bash
npm install

npx playwright install  # this will install the browser binaries

# Link the package globally to use 'kusho' command
npm link
```

After linking, you can use the `kusho` command syntax throughout your terminal.

## Getting Started

### Step 1: Configure LLM Provider

KushoAI TUI runs entirely locally and generates tests using your own LLM API keys. Before recording, configure your preferred provider:

```bash
kusho credentials
```

You'll be prompted to choose a provider and enter your API key:
1. **OpenAI** (default model: `gpt-4o`) - [Get an API key](https://platform.openai.com/api-keys)
2. **Anthropic** (default model: `claude-haiku-4-5-20251001`) - [Get an API key](https://console.anthropic.com/settings/keys)
3. **Gemini** (default model: `gemini-2.5-flash`) - [Get an API key](https://aistudio.google.com/app/apikey)

<img width="1068" height="496" alt="kusho cred 3" src="https://github.com/user-attachments/assets/1b95946a-820f-4391-baa2-52de16dcc33e" />
<br>

You can optionally override the default model during setup. Your API keys are stored locally in `~/.kusho-credentials` and are never sent to any external servers other than your chosen LLM provider.

## Workflow

```html
┌─────────────────┐
│  Start Here     │
└─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ kusho record    │────▶│ Record UI       │
│ [URL]           │     │ interactions    │
│ [--output file] │     │ in browser      │
└─────────────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Save to         │     │ Generated       │
│ recordings/     │◀────│ Playwright code │
│ folder          │     │ (saved to file) │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ kusho extend    │
│ [test-file.js]  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ AI enhances     │
│ test & saves to │
│ extended-tests/ │
└─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ kusho run       │     │ kusho run       │     │ kusho           │
│ [test-name]     │     │ [test-name]     │     │ run-recording   │
│                 │     │ --headed        │     │ [name]          │
│                 │     │ --record        │     │ (debug orig.)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Run tests       │     │ Run tests with  │     │ Run original    │
│ headlessly      │     │ browser visible │     │ recording for   │
│                 │     │ & record video  │     │ debugging       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Usage

### Step 2: Record UI Interactions

**What happens during recording:**
1. **Browser Opens**: The command launches a browser window for interaction
2. **Record Your Flow**: Navigate, click, fill forms, and perform any actions you want to test
3. **Close Browser**: Simply close the browser when finished to complete recording
4. **View Script**: You'll see the generated Playwright script that captured your actions
5. **Edit Script**: The script opens in your terminal editor for review and modifications
6. **Save to Continue**: Save the file to proceed to the next step

Start recording UI interactions:

```bash
kusho record
```

#### Recording Options

```bash
# Record from specific URL
kusho record https://example.com

# Record with device emulation
kusho record --device "iPhone 13" https://example.com

# Record with custom viewport
kusho record --viewport "1280,720" https://example.com
```

### Demo

Try the recorder with Playwright's demo site:

```bash
kusho demo
```

### Interactive TUI

Open the full interactive menu to run all flows guided step-by-step:

```bash
kusho ui
```

<img width="837" height="418" alt="kusho ui" src="https://github.com/user-attachments/assets/8fd56ad5-1a65-4fa7-ab62-a588b6d676a0" />
<br>

The TUI presents an arrow-key menu with all available actions:

| Action | What it does |
|---|---|
| 🎬 Record | Prompts for URL, device, viewport, target language, output filename, wait-enhancement — then opens Playwright codegen |
| 📋 Extend | Pick a recording → AI expands it into test variations |
| ✨ Kusho Edit | Pick an extended test → refine it with plain-English instructions |
| ▶ Run | Pick an extended test → choose headless/headed + optional video recording |
| ▶ Run recording | Pick a raw recording → choose headless/headed + optional video |
| 🔑 Update credentials | Change LLM provider / API key |
| 🎭 Demo | Opens Playwright codegen on demo.playwright.dev/todomvc |
| ✗ Quit | Exit |

Every option available via direct `kusho <command>` flags is also surfaced in the TUI. Press `Esc` or `Ctrl+C` at any prompt to cancel and return to the main menu.

### Step 3: Review & Edit Tests

After recording, Kusho AI generates comprehensive test scenarios that open in your terminal editor:

**What you can do:**
- **Review Generated Tests**: See all test variations created from your recording
- **Edit Existing Tests**: Modify selectors, assertions, or test logic as needed
- **Add New Tests**: Create additional test scenarios for edge cases
- **Remove Unwanted Tests**: Delete any test scenarios you don't need

**Editor Quick Commands:**
- **Vim**: Press `i` to edit, `Esc` then `:wq` to save and exit
- **Nano**: Edit normally, `Ctrl+X` then `Y` then `Enter` to save
- **Vi**: Press `i` to edit, `Esc` then `:wq` to save and exit

**Save the file to proceed to test generation.**

After saving, you'll be prompted to provide optional instructions to guide the AI:

```
💡 Any specific instructions for generating test variations? (Press Enter to skip):
> add error handling tests and verify error messages are displayed correctly
```

### Step 4: Generate Exhaustive Test Script

Kusho combines your recording and customized tests to create a comprehensive, executable test script. This process:
- Merges your original recording with customized test scenarios
- Creates multiple test variations and edge cases based on any instructions you provided
- Converts everything into optimized Playwright code
- Generates a comprehensive test script ready for execution

Once your comprehensive test script is generated, you can use the `kusho edit` command to interactively refine the script using plain English instructions.

```bash
kusho edit [filename|latest]
```

This starts an interactive edit loop where you can describe changes you want to apply to your script:

```
✏️  Edit instruction (or "done" to exit): add assertions for the page title
✅ Edit applied successfully!

✏️  Edit instruction (or "done" to exit): done
```

### Extend Existing Test File (Advanced)

For advanced users, extend an existing test file with KushoAI variations:

```bash
kusho extend path/to/your/test.js

kusho extend latest  # to extend the latest recording
```

### Step 5: Run Tests

Execute your generated test suite and get comprehensive reports:

```bash
# Interactive test selection (recommended)
kusho run

# Run latest test
kusho run latest

# Run specific test
kusho run your-test-name

# Run with additional options
kusho run your-test-name --headed --record
```

**Run Options:**
- `--headed`: Run tests in visible browser (great for debugging)
- `--record`: Record videos and screenshots during test execution

**Test Reports:**
After running tests, you'll get comprehensive reports with:
- Detailed test execution results and pass/fail status
- Screenshots and videos of test runs (if `--record` flag used)
- Performance metrics and timing information
- Error details and debugging information
- HTML report accessible via browser

### Update LLM Provider Settings

Change your LLM provider or update your API key anytime:

```bash
kusho credentials
```

### Run Extended Tests

Run tests from the extended-tests folder:

```bash
# Choose from interactive list
kusho run

# Run specific test
kusho run login-test

# Run latest test
kusho run latest

# Run with options
kusho run login-test --headed --record
```

### Run Recordings

Run a test from the recordings folder:

```bash
# Choose from interactive list
kusho run-recording

# Run specific recording
kusho run-recording login-test

# Run latest recording
kusho run-recording latest

# Run with options
kusho run-recording login-test --headed
```

## Command Options

- `-d, --device <device>` - Device to emulate (e.g., "iPhone 13")
- `-v, --viewport <size>` - Viewport size (e.g., "1280,720")
- `-t, --target <lang>` - Target language (javascript, python, etc.)
- `-o, --output <filename>` - Output filename for generated code
- `--no-wait-enhancement` - Disable intelligent wait enhancement

## Output

The recorder creates a `kusho-tests/` folder structure:
- `kusho-tests/recordings/` - Original recorded tests
- `kusho-tests/extended-tests/` - AI-enhanced test suites

Generated code is displayed in real-time in the terminal as you perform UI interactions.
