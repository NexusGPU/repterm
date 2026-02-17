/**
 * 示例 6: Terminal 断言
 *
 * 运行方式: bun run repterm examples/06-terminal-assertions.ts
 */

import { test, expect, describe } from 'repterm';

describe('Terminal 断言', () => {
  test('检查终端包含特定文本', async ({ $, terminal }) => {
    await $`echo "Welcome to Repterm"`;

    await expect(terminal).toContainText('Welcome');
    await expect(terminal).toContainText('Repterm');
  });

  test('使用正则匹配终端输出', async ({ $, terminal }) => {
    await $`echo "Version: 1.2.3"`;
    await expect(terminal).toMatchPattern(/Version: \d+\.\d+\.\d+/);
  });

  test('否定断言：确保终端不包含错误', async ({ $, terminal }) => {
    await $`echo "Success"`;

    await expect(terminal).not.toContainText('Error');
    await expect(terminal).not.toMatchPattern(/exception|error/i);
  });
});

describe('snapshot 方法', () => {
  test('获取终端快照', async ({ $, terminal }) => {
    await $`echo "Line 1"`;
    await $`echo "Line 2"`;

    const snapshot = await terminal.snapshot();

    if (!snapshot.includes('Line 1') || !snapshot.includes('Line 2')) {
      throw new Error('Snapshot should contain both lines');
    }
    console.log(`  Terminal snapshot length: ${snapshot.length}`);
  });
});
