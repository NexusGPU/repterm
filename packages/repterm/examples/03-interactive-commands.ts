/**
 * 示例 3: 交互式命令
 * 
 * 运行方式: bun src/cli/index.ts examples/03-interactive-commands.ts
 */

import { test, expect, describe } from '../src/index.js';

describe('交互式命令', () => {
  test('混合用法：先用控制器方法，再 await', async ({ terminal }) => {
    const proc = terminal.run('echo "step 1"; sleep 0.1; echo "step 2"');

    await proc.expect('step 1');
    console.log('  Step 1 completed');

    const result = await proc;
    expect(result).toSucceed();
    expect(result).toContainInOutput('step 2');
  });
});

describe('PTYProcess PromiseLike 特性', () => {
  test('PTYProcess 可以直接 await', async ({ terminal }) => {
    const result = await terminal.run('echo test');
    expect(result).toSucceed();
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
});
