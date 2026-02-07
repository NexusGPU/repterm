/**
 * 示例 5: 多终端测试
 * 
 * 运行方式: bun run repterm examples/05-multi-terminal.ts
 */

import { test, expect, describe } from 'repterm';

describe('多终端测试', () => {
  test('创建第二个终端', async ({ terminal }) => {
    const result1 = await terminal.run('echo "Terminal 1"');
    expect(result1).toSucceed();
    expect(result1).toHaveStdout('Terminal 1');

    // 创建第二个终端
    const terminal2 = await terminal.create();

    const result2 = await terminal2.run('echo "Terminal 2"');
    expect(result2).toSucceed();
    expect(result2).toHaveStdout('Terminal 2');

    await terminal2.close();
  });

  test('使用文件进行进程间通信', async ({ terminal }) => {
    const terminal2 = await terminal.create();
    const commFile = '/tmp/repterm-comm-example.txt';

    try {
      await terminal.run(`echo "Hello from T1" > ${commFile}`);

      const readResult = await terminal2.run(`cat ${commFile}`);
      expect(readResult).toHaveStdout('Hello from T1');

      await terminal2.run(`echo "Response from T2" >> ${commFile}`);

      const fullResult = await terminal.run(`cat ${commFile}`);
      expect(fullResult).toContainInOutput('Hello from T1');
      expect(fullResult).toContainInOutput('Response from T2');
    } finally {
      await terminal2.close();
      await terminal.run(`rm -f ${commFile}`);
    }
  });
});
