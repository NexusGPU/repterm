/**
 * 示例 4: 使用 Hooks 实现 Fixtures
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
  // beforeEach 返回的对象会被注入到 context
  beforeEach(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repterm-example-'));
    console.log(`  [Setup] Created: ${tmpDir}`);
    return { tmpDir };
  });

  // afterEach 可以访问之前注入的属性
  afterEach(async ({ tmpDir }) => {
    if (tmpDir) {
      await fs.rm(tmpDir as string, { recursive: true }).catch(() => {});
      console.log(`  [Cleanup] Removed: ${tmpDir}`);
    }
  });

  test('在临时目录中创建文件', async ({ terminal, tmpDir }) => {
    const result = await terminal.run(`touch ${tmpDir}/test.txt && ls ${tmpDir}`);
    expect(result).toSucceed();
    expect(result).toHaveStdout('test.txt');
  });

  test('在临时目录中写入和读取文件', async ({ terminal, tmpDir }) => {
    await terminal.run(`echo "Hello World" > ${tmpDir}/hello.txt`);
    
    const readResult = await terminal.run(`cat ${tmpDir}/hello.txt`);
    expect(readResult).toSucceed();
    expect(readResult).toHaveStdout('Hello World');
  });
});
