/**
 * 示例 9: 多窗口 WebServer 测试 (录制模式)
 * 
 * 运行方式: bun src/cli/index.ts --record examples/09-webserver-multi-terminal.ts
 * 
 * 演示场景：
 * 1. 在默认终端启动一个 web server (python -m http.server)
 * 2. 创建新终端，使用 curl 访问 web server
 * 3. 验证响应正确，关闭 server
 */

import { test, expect, describe } from '../src/index.js';

describe('WebServer 多终端测试', { record: true }, () => {
    test('启动 server 并从另一个终端访问', async ({ terminal }) => {
        const PORT = 18080;

        // 1. 在默认终端启动 web server (交互式，不 await)
        const server = terminal.run(`python3 -m http.server ${PORT}`, { interactive: true });

        // 等待 server 启动完成
        await server.expect(`Serving HTTP on`);
        console.log('  [Server] 已启动');

        // 2. 创建第二个终端用于 curl 请求
        const clientTerminal = await terminal.create();

        try {
            // 3. 使用 curl 访问 server (交互式模式)
            const curlProc = clientTerminal.run(`curl -s http://localhost:${PORT}/`, { interactive: true });

            // 等待 curl 返回（匹配 HTML 中的链接标签，比 title 更可靠）
            await curlProc.expect('href');
            console.log('  [Client] 访问成功');

        } finally {
            // 4. 停止 server
            await server.interrupt();
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('  [Server] 已停止');
        }
    });

    test('使用文件进行进程间通信', async ({ terminal }) => {
        const COMM_FILE = '/tmp/repterm-ipc-test.txt';

        // 1. 在主终端写入消息
        // 注意：必须用 await 等待命令完成，或用 expect() 确保命令被执行
        const writeProc = terminal.run(`echo "Hello from main terminal" > ${COMM_FILE} && echo "WRITE_DONE"`, { interactive: true });
        await writeProc.expect('WRITE_DONE');  // 用确定性标记替代 shell 提示符
        console.log('  [Main] 消息已写入');

        // 2. 创建第二个终端
        const secondTerminal = await terminal.create();

        try {
            // 3. 在第二个终端读取消息
            const readProc = secondTerminal.run(`cat ${COMM_FILE}`, { interactive: true });
            await readProc.expect('Hello from main terminal');
            console.log('  [Second] 消息已读取');

            // 4. 在第二个终端追加响应
            const appendProc = secondTerminal.run(`echo "Response from second terminal" >> ${COMM_FILE} && echo "APPEND_DONE"`, { interactive: true });
            await appendProc.expect('APPEND_DONE');
            console.log('  [Second] 响应已追加');

            // 5. 在主终端验证完整内容
            const verifyProc = terminal.run(`cat ${COMM_FILE}`, { interactive: true });
            await verifyProc.expect('Response from second terminal');
            console.log('  [Main] 验证成功');

        } finally {
            // 清理临时文件
            const cleanProc = terminal.run(`rm -f ${COMM_FILE} && echo "CLEANUP_DONE"`, { interactive: true });
            await cleanProc.expect('CLEANUP_DONE');
        }
    });
});
