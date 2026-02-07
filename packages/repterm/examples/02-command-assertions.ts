/**
 * Example 2: CommandResult assertions
 *
 * Run: bun run repterm examples/02-command-assertions.ts
 */

import { test, expect, describe } from 'repterm';

describe('Chained assertions', () => {
  test('multiple assertions can be chained', async ({ terminal }) => {
    const result = await terminal.run('echo "version 1.2.3"');
    debugger;
    expect(result)
      .toSucceed()
      .toHaveStdout('version')
      .toHaveStdout('1.2.3');
  });

  test('full output verification', async ({ terminal }) => {
    const result = await terminal.run('echo "Hello"; echo "Error" >&2');

    expect(result)
      .toSucceed()
      .toHaveStdout('Hello')
      .toHaveStderr('Error')
      .toContainInOutput('Hello')
      .toContainInOutput('Error');
  });
});

describe('Negated assertions', () => {
  test('use .not for negation', async ({ terminal }) => {
    const result = await terminal.run('echo "success"');

    expect(result).not.toFail();
    expect(result).not.toContainInOutput('error');
    expect(result).not.toHaveStderr('fatal');
  });
});

describe('Regex matching', () => {
  test('match stdout with regex', async ({ terminal }) => {
    const result = await terminal.run('echo "version 2.5.10"');
    expect(result).toMatchStdout(/version \d+\.\d+\.\d+/);
  });

  test('negated regex match', async ({ terminal }) => {
    const result = await terminal.run('echo "all good"');
    expect(result).not.toMatchStdout(/error|fail|exception/i);
  });
});
