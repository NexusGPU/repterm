/**
 * 示例 3: 交互式命令
 * 
 * 运行方式: bun src/cli/index.ts examples/03-interactive-commands.ts
 * 
 * 重要：交互式命令需要使用 { interactive: true } 选项
 * 交互模式下 exitCode 不可靠，应使用输出断言
 */

import { test, expect, describe } from '../src/index.js';

describe('交互式命令', () => {
  test('使用 interactive 选项执行交互式命令', async ({ terminal }) => {
    // 使用 { interactive: true } 启用交互模式，支持 expect/send 方法
    const proc = terminal.run('echo "step 1"; sleep 0.1; echo "step 2"', { interactive: true });

    await proc.expect('step 1');
    console.log('  Step 1 completed');

    const result = await proc;
    // 注意：交互模式下 result.code 不可靠（返回 -1），使用输出断言
    expect(result).toContainInOutput('step 2');
  });
});

describe('PTYProcess PromiseLike 特性', () => {
  test('PTYProcess 可以直接 await（非交互模式）', async ({ terminal }) => {
    // 非交互模式：使用 Bun.spawn，exitCode 精确
    const result = await terminal.run('echo test');
    expect(result).toSucceed();
    console.log(`  Exit code: ${result.code}`);
  });

  test('PTYProcess 支持 .finally', async ({ terminal }) => {
    let cleanupCalled = false;

    const result = await terminal.run('echo test').finally(() => {
      cleanupCalled = true;
    });

    expect(result).toSucceed();
    if (!cleanupCalled) {
      throw new Error('Expected cleanupCalled to be true');
    }
  });

  test('非交互模式可以获取分离的 stdout/stderr', async ({ terminal }) => {
    const result = await terminal.run('echo "stdout" && echo "stderr" >&2');
    
    console.log(`  stdout: ${result.stdout.trim()}`);
    console.log(`  stderr: ${result.stderr.trim()}`);
    
    if (!result.stdout.includes('stdout')) {
      throw new Error('Expected stdout to contain "stdout"');
    }
    if (!result.stderr.includes('stderr')) {
      throw new Error('Expected stderr to contain "stderr"');
    }
  });
});
