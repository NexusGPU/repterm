/**
 * 示例 1: 基础命令执行
 * 
 * 运行方式: bun run repterm examples/01-basic-commands.ts
 */

import { test, expect, describe } from 'repterm';

describe('基础命令执行', () => {
  test('执行 echo 命令', async ({ terminal }) => {
    const result = await terminal.run('echo "Hello, Repterm!"');
    expect(result).toSucceed();
    expect(result).toHaveStdout('Hello, Repterm!');
  });

  test('检查命令退出码', async ({ terminal }) => {
    const result = await terminal.run('exit 42');
    expect(result).toHaveExitCode(42);
    expect(result).toFail();
  });

  test('检查 stderr 输出', async ({ terminal }) => {
    const result = await terminal.run('echo "error message" >&2');
    expect(result).toSucceed();
    expect(result).toHaveStderr('error message');
  });

  test('访问 CommandResult 的新字段', async ({ terminal }) => {
    const result = await terminal.run('echo "done"');
    
    // 新增字段
    console.log(`  执行时长: ${result.duration}ms`);
    console.log(`  原始命令: ${result.command}`);
    console.log(`  命令成功: ${result.successful}`);
    
    expect(result).toSucceed();
  });
});
