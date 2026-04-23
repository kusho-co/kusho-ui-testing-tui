const chalk = require('chalk');

function section(title) {
  console.log(chalk.gray('\n' + '─'.repeat(52)));
  console.log(chalk.blue(`📌 ${title}`));
  console.log(chalk.gray('─'.repeat(52)));
}

function success(message) {
  console.log(chalk.green(`✅ ${message}`));
}

function error(message) {
  console.log(chalk.red(`❌ ${message}`));
}

function warning(message) {
  console.log(chalk.yellow(`⚠️  ${message}`));
}

function info(message) {
  console.log(chalk.cyan(`ℹ️  ${message}`));
}

function hint(message) {
  console.log(chalk.magenta(`💡 ${message}`));
}

module.exports = {
  section,
  success,
  error,
  warning,
  info,
  hint,
};
