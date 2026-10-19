// Creates a staff account for the dashboard. You'll be asked for the password.
//
// Usage:
//   npm run add-user -- --username admin --name "Isaiah Angelo G. Masing" --role admin
//
// Roles: admin (everything), staff (registration, fixing numbers), teacher (viewing attendance).
const { parseArgs } = require('node:util');
const readline = require('node:readline');
const users = require('../src/services/users');

const USAGE = 'Usage: npm run add-user -- --username admin --name "Juan Dela Cruz" --role admin';

function fail(message) {
  console.error(message);
  process.exit(1);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      username: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'staff' },
      section: { type: 'string' },
    },
  }));
} catch (err) {
  fail(`${err.message}\n${USAGE}`);
}
if (!values.username || !values.name) fail(`Required: --username and --name\n${USAGE}`);

// Asks questions without showing what is typed (for passwords). One reader for all answers,
// so typed or pasted lines are never lost between questions.
function hiddenPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  let muted = false;
  rl._writeToOutput = (text) => { if (!muted) rl.output.write(text); };
  const answers = [];
  const waiting = [];
  rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : answers.push(line)));
  rl.on('close', () => { if (waiting.length) fail('\nNo password was entered.'); });
  return {
    ask(question) {
      rl.output.write(question);
      muted = true;
      return new Promise((resolve) => {
        const done = (line) => {
          muted = false;
          rl.output.write('\n');
          resolve(line);
        };
        if (answers.length) done(answers.shift());
        else waiting.push(done);
      });
    },
    close: () => rl.close(),
  };
}

(async () => {
  const prompt = hiddenPrompt();
  const password = await prompt.ask('Password (at least 8 characters): ');
  const again = await prompt.ask('Type it again: ');
  prompt.close();
  if (password !== again) fail('The passwords do not match.');
  try {
    const user = await users.create({
      username: values.username,
      fullName: values.name,
      role: values.role,
      password,
      section: values.section ?? null,
    });
    console.log(`Added ${user.role} account "${user.username}" for ${user.fullName}.`);
  } catch (err) {
    fail(err.message);
  }
})();
