/**
 * 示例 2: CommandResult 断言
 * 
 * 运行方式: bun src/cli/index.ts examples/02-command-assertions.ts
 */

import { test, expect, describe } from '../src/index.js';

describe('链式断言', () => {
  test('多个断言可以链式调用', async ({ terminal }) => {
    const result = await terminal.run('echo "version 1.2.3"');

    expect(result)
      .toSucceed()
      .toHaveStdout('version')
      .toHaveStdout('1.2.3');
  });

  test('完整的输出验证', async ({ terminal }) => {
    const result = await terminal.run('echo "Hello"; echo "Error" >&2');

    expect(result)
      .toSucceed()
      .toHaveStdout('Hello')
      .toHaveStderr('Error')
      .toContainInOutput('Hello')
      .toContainInOutput('Error');
  });
});

describe('否定断言', () => {
  test('使用 .not 进行否定断言', async ({ terminal }) => {
    const result = await terminal.run('echo "success"');

    expect(result).not.toFail();
    expect(result).not.toContainInOutput('error');
    expect(result).not.toHaveStderr('fatal');
  });
});

describe('正则匹配', () => {
  test('使用正则匹配 stdout', async ({ terminal }) => {
    const result = await terminal.run('echo "version 2.5.10"');
    expect(result).toMatchStdout(/version \d+\.\d+\.\d+/);
  });

  test('否定正则匹配', async ({ terminal }) => {
    const result = await terminal.run('echo "all good"');
    expect(result).not.toMatchStdout(/error|fail|exception/i);
  });
});
