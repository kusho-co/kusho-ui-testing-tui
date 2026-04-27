const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.5-flash',
};

const MAX_TOKENS = 3000;
const TEMPERATURE_GENERATE = 0.7;
const TEMPERATURE_EDIT = 0.3;
const MAX_RETRIES = 3;
const BATCH_SIZE = 8;

//Providers
class OpenAIProvider {
  constructor(apiKey, model = DEFAULT_MODELS.openai) {
    const { default: OpenAI } = require('openai');
    this.model = model;
    this.client = new OpenAI({ apiKey, timeout: 180000 });
  }

  async generate(prompt, temperature, maxTokens) {
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_completion_tokens: maxTokens,
        });
        return response.choices[0].message.content;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES - 1) {
          // Exponential backoff: 2s, 5s, 9s (matches Python backend)
          const waitMs = (Math.pow(2, attempt) + 1) * 1000;
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
    }
    throw new Error(`OpenAI API failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
  }
}

class AnthropicProvider {
  constructor(apiKey, model = DEFAULT_MODELS.anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    this.model = model;
    this.client = new Anthropic({ apiKey });
  }

  async generate(prompt, temperature, maxTokens) {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      });
      return response.content[0].text;
    } catch (error) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
}

class GeminiProvider {
  constructor(apiKey, model = DEFAULT_MODELS.gemini) {
    const { GoogleGenAI } = require('@google/genai');
    this.model = model;
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(prompt, temperature, maxTokens) {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      });
      return response.text;
    } catch (error) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
}


//client used by recorder
class LLMClient {
  /**
   * @param {Object} credentials
   * @param {string} credentials.provider  - 'openai' | 'anthropic' | 'gemini'
   * @param {string} credentials.apiKey
   * @param {string} [credentials.model]   - optional override
   */
  constructor({ provider, apiKey, model }) {
    this.providerName = provider;
    this.model = model || DEFAULT_MODELS[provider];

    switch (provider) {
      case 'openai':
        this._provider = new OpenAIProvider(apiKey, this.model);
        break;
      case 'anthropic':
        this._provider = new AnthropicProvider(apiKey, this.model);
        break;
      case 'gemini':
        this._provider = new GeminiProvider(apiKey, this.model);
        break;
      default:
        throw new Error(
          `Unsupported provider: "${provider}". Choose from: openai, anthropic, gemini`
        );
    }
  }

  // Low-level call
  async _call(prompt, temperature = TEMPERATURE_GENERATE, maxTokens = MAX_TOKENS) {
    return this._provider.generate(prompt, temperature, maxTokens);
  }

  async validateCredentials() {
    try {
      await this._provider.generate('Say "ok"', 0, 5);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Response cleaning
  _clean(response) {
    if (response.includes('```javascript')) {
      const match = response.match(/```javascript\s*([\s\S]*?)\s*```/);
      if (match) return match[1].trim();
    }
    if (response.includes('```')) {
      const match = response.match(/```\s*([\s\S]*?)\s*```/);
      if (match) return match[1].trim();
    }
    return response.trim();
  }

  // Prompt builders 
  _testCasesPrompt(script, instructions = '') {
    let prompt = `
You are a QA automation expert. I have a Playwright test script and I want you to analyze it and generate comprehensive test case descriptions.

Please analyze the original script and create test case descriptions that cover different scenarios a human tester would try:

1. **Input Field Variations**: For text inputs, create tests with:
   - Valid data (different formats)
   - Invalid data (special characters, too long/short)
   - Edge cases (empty, null, whitespace)
   - Boundary values

2. **User Flow Variations**: Create tests for:
   - Different user paths to reach the same goal
   - Error scenarios and recovery
   - Different sequences of actions

3. **UI Element Interactions**: Test:
   - Different ways to interact with elements (click, keyboard, etc.)
   - Waiting for elements in different states
   - Handling dynamic content

**Original Script:**
\`\`\`javascript
${script}
\`\`\`

**Output Format:**
Return ONLY a simple list of test case descriptions, one per line. No JSON, no formatting, just plain text descriptions separated by newlines.

Example:
Original test flow with valid login credentials
Test login with empty email field
Test login with empty password field
Test login with invalid email format
Test login with special characters in password
Test login with very long email address

Please provide 10-15 comprehensive test case descriptions covering all major scenarios.
`;
    if (instructions) {
      prompt += `\n**Additional Instructions from User:**\n${instructions}\nMake sure to prioritize these instructions when generating test cases.\n`;
    }
    return prompt;
  }

  _scriptGenerationPrompt(script, testCases, instructions = '') {
    let prompt = `
You are a QA automation expert. I have a Playwright test script and a list of test cases. Please generate actual Playwright test functions for these test cases.

**Original Script:**
\`\`\`javascript
${script}
\`\`\`

**Test Cases to Implement:**
${testCases}

**IMPORTANT Requirements:**
- DO NOT add browser, context, or page creation code, just test functions
- Focus only on page interactions and assertions
- Use \`expect()\` from Playwright for assertions
- Each test should be a separate function using the test() format
- Use the test case description as the test name
- Handle potential race conditions with appropriate waits

**Test Function Format:**
\`\`\`javascript
// Original test converted to proper format
test('Original Test Flow', async ({ page }) => {
  await page.goto('https://www.google.com/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('combobox', { name: 'Search' }).fill('Playwright Testing');
  await page.getByRole('button', { name: 'Google Search' }).click();
  await page.waitForLoadState('load');
  expect(await page.title()).toContain('Playwright Testing');
});
\`\`\`

**Output Format:**
Return only the test functions (no imports, those will be added separately):
`;
    if (instructions) {
      prompt += `\n**Additional Instructions from User:**\n${instructions}\nMake sure to apply these instructions when writing the test scripts.\n`;
    }
    return prompt;
  }

  _editPrompt(script, instruction) {
    return `
You are a QA automation expert. You have an existing Playwright test script and need to apply a specific change to it.

**Existing Script:**
\`\`\`javascript
${script}
\`\`\`

**Change to Apply:**
${instruction}

**IMPORTANT Requirements:**
- Apply ONLY the requested change — do not restructure, reformat, or rewrite unrelated parts
- Preserve all existing imports, test names, and logic that are not affected by the change
- Return the FULL modified script (not just the changed parts)
- Keep the same code style as the original

**Output Format:**
Return the complete modified JavaScript test script only, with no extra commentary.
`;
  }

  _combineTestFunctions(batches, testCases) {
    const imports = `import { test, expect } from '@playwright/test';\n\n`;
    const comment = testCases
      ? `/*\n\n[KUSHO] Test Cases Generated:\n${testCases}\n\n*/\n\n`
      : '';
    return imports + comment + batches.join('\n\n');
  }

  // High-level service methods (called by recorder.js)
  /**
   * Generate plain-text test case descriptions from a Playwright script.
   * @param {string} script
   * @param {string} [instructions]
   * @returns {Promise<string>} newline-separated test case descriptions
   */
  async generateTestCases(script, instructions = '') {
    const prompt = this._testCasesPrompt(script, instructions);
    const raw = await this._call(prompt, TEMPERATURE_GENERATE);
    return this._clean(raw);
  }

  /**
   * Generate Playwright test functions from test case descriptions.
   * Processes in batches of 8
   * @param {string} script  - original recording
   * @param {string} testCases - newline-separated descriptions
   * @param {string} [instructions]
   * @returns {Promise<string>} complete extended test script with imports
   */
  async generateTestScripts(script, testCases, instructions = '') {
    const lines = testCases.split('\n').filter(l => l.trim());
    const batches = [];

    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      const batchText = lines.slice(i, i + BATCH_SIZE).join('\n');
      const prompt = this._scriptGenerationPrompt(script, batchText, instructions);
      const raw = await this._call(prompt, TEMPERATURE_GENERATE);
      batches.push(this._clean(raw));
    }

    return this._combineTestFunctions(batches, testCases);
  }

  /**
   * Apply a natural-language edit instruction to an existing test script.
   * @param {string} script
   * @param {string} instruction
   * @returns {Promise<string>} modified script
   */
  async editTestScript(script, instruction) {
    const prompt = this._editPrompt(script, instruction);
    const raw = await this._call(prompt, TEMPERATURE_EDIT);
    return this._clean(raw);
  }
}

module.exports = LLMClient;
module.exports.DEFAULT_MODELS = DEFAULT_MODELS;
