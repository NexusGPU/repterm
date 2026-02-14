/**
 * Example 2: CommandResult assertions
 *
 * Run: bun run repterm examples/02-command-assertions.ts
 */

import { test, expect, describe } from 'repterm';

describe('Chained assertions', () => {
  test('multiple assertions can be chained', async ({ $ }) => {
    const result = await $`echo "version 1.2.3"`;
    debugger;
    expect(result)
      .toSucceed()
      .toHaveStdout('version')
      .toHaveStdout('1.2.3');
  });

  test('full output verification', async ({ $ }) => {
    const result = await $`echo "Hello"; echo "Error" >&2`;

    expect(result)
      .toSucceed()
      .toHaveStdout('Hello')
      .toHaveStderr('Error')
      .toContainInOutput('Hello')
      .toContainInOutput('Error');
  });
});

describe('Negated assertions', () => {
  test('use .not for negation', async ({ $ }) => {
    const result = await $`echo "success"`;

    expect(result).not.toFail();
    expect(result).not.toContainInOutput('error');
    expect(result).not.toHaveStderr('fatal');
  });
});

describe('Regex matching', () => {
  test('match stdout with regex', async ({ $ }) => {
    const result = await $`echo "version 2.5.10"`;
    expect(result).toMatchStdout(/version \d+\.\d+\.\d+/);
  });

  test('negated regex match', async ({ $ }) => {
    const result = await $`echo "all good"`;
    expect(result).not.toMatchStdout(/error|fail|exception/i);
  });
});
