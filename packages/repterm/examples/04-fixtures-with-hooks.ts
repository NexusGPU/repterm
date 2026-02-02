/**
 * 示例 4: 使用 Hooks 实现 Fixtures (懒加载)
 * 
 * 运行方式: bun src/cli/index.ts examples/04-fixtures-with-hooks.ts
 * 
 * 注意：此示例独立运行，不要与其他示例一起运行，因为 hooks 是全局共享的
 */

import { test, expect, describe, beforeEach, afterEach } from '../src/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('临时目录 Fixture', () => {
  // 注册名为 'tmpDir' 的 fixture
  // 只有测试参数中请求了 tmpDir 才会执行
  beforeEach('tmpDir', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repterm-example-'));
    console.log(`  [Setup] Created: ${tmpDir}`);
    return { tmpDir };
  });

  // 对应的 afterEach 也需要指定名称
  // 只有 beforeEach 被执行了才会执行清理
  afterEach('tmpDir', async (ctx) => {
    const tmpDir = ctx.tmpDir as string | undefined;
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true }).catch(() => { });
      console.log(`  [Cleanup] Removed: ${tmpDir}`);
    }
  });

  test('在临时目录中创建文件', async ({ terminal, tmpDir }) => {
    const result = await terminal.run(`touch ${tmpDir}/test.txt && ls ${tmpDir}`);
    expect(result).toSucceed();
    expect(result).toHaveStdout('test.txt');
  });

  test('不运行 before after', async ({ terminal }) => {
    // 这个测试不需要 tmpDir，所以不会触发 beforeEach/afterEach
    console.log('  [Test] 此测试不会触发 tmpDir fixture');
    await terminal.run('echo "Hello World"');
  });

  test('在临时目录中写入和读取文件', async ({ terminal, tmpDir }) => {
    await terminal.run(`echo "Hello World" > ${tmpDir}/hello.txt`);

    const readResult = await terminal.run(`cat ${tmpDir}/hello.txt`);
    expect(readResult).toSucceed();
    expect(readResult).toHaveStdout('Hello World');
  });
});

