const clack = require('@clack/prompts');
const chalk = require('chalk');

/**
 * Print the KushoAI branded intro banner.
 * Call once at the start of each command.
 */
function banner(title = 'KushoAI CLI') {
  clack.intro(chalk.bold.cyan(`⚡ ${title}`));
}

/**
 * Print a section header as a note panel.
 */
function section(title) {
  clack.note('', chalk.bold.blue(`📌 ${title}`));
}

function success(message) {
  clack.log.success(message);
}

function error(message) {
  clack.log.error(message);
}

function warning(message) {
  clack.log.warn(message);
}

function info(message) {
  clack.log.info(message);
}

function hint(message) {
  clack.log.message(chalk.magenta(`💡 ${message}`));
}

/**
 * Print a closing outro message.
 */
function done(message = 'Done!') {
  clack.outro(chalk.green(message));
}

/**
 * Return a @clack/prompts spinner instance.
 * Usage:
 *   const s = spinner();
 *   s.start('Thinking...');
 *   s.stop('Done!');
 */
function spinner() {
  return clack.spinner();
}

module.exports = {
  banner,
  section,
  success,
  error,
  warning,
  info,
  hint,
  done,
  spinner,
  // expose clack directly for advanced use in other modules
  clack,
};
