/**
 * 示例 8: 录制演示
 * 
 * 这是一个录制测试示例，标注了 { record: true }
 * 只有在使用 --record 参数时才会运行
 * 
 * 运行方式: bun src/cli/index.ts --record examples/08-recording-demos.ts
 * 
 * 注意：
 * - 录制模式需要安装 asciinema 和 tmux
 * - 录制模式下 exitCode 不可靠，应使用输出断言
 */

import { test, expect, describe } from '../src/index.js';

describe('录制演示', { record: true }, () => {
  test('基础命令演示', async ({ terminal }) => {
    // 录制模式下，命令会被记录到 .cast 文件
    await terminal.run('echo "欢迎使用 Repterm 测试框架"');
    await expect(terminal).toContainText('欢迎');
  });

  test('多命令演示', async ({ terminal }) => {
    await terminal.run('pwd');
    await terminal.run('ls -la');
    await terminal.run('echo "演示完成"');
  });
});

// 单独的录制测试
test('独立录制测试', { record: true }, async ({ terminal }) => {
  await terminal.run('echo "这是一个独立的录制测试"');
  await terminal.run('date');
});

// 普通测试（不标注 record: true）
// 这个测试只会在不使用 --record 时运行
describe('普通功能测试', () => {
  test('验证退出码', async ({ terminal }) => {
    const result = await terminal.run('echo "success"');
    expect(result).toSucceed();
    console.log(`  Exit code: ${result.code}`);
  });
});
