/**
 * Example 9: Multi-window WebServer Test (Recording Mode)
 *
 * Run: bun run repterm --record examples/09-webserver-multi-terminal.ts
 *
 * Demo scenario:
 * 1. Start a web server in the default terminal (python -m http.server)
 * 2. Create new terminal, use curl to access web server
 * 3. Verify response is correct, close server
 */

import { test, expect, describe } from 'repterm';

describe('WebServer Multi-terminal Test', { record: true }, () => {
    test('Start server and access from another terminal', async ({ terminal }) => {
        const PORT = 18080;

        // 1. Start web server in default terminal (interactive, don't await)
        const server = terminal.run(`python3 -m http.server ${PORT}`, { interactive: true });

        // Wait for server startup to complete
        await server.expect(`Serving HTTP on`);
        console.log('  [Server] Started');

        // 2. Create second terminal for curl request
        const clientTerminal = await terminal.create();

        try {
            // 3. Use curl to access server (interactive mode)
            const curlProc = clientTerminal.run(`curl -s http://localhost:${PORT}/`, { interactive: true });

            // Wait for curl to return (match href in HTML, more reliable than title)
            await curlProc.expect('href');
            console.log('  [Client] Access successful');

        } finally {
            // 4. Stop server
            await server.interrupt();
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('  [Server] Stopped');
        }
    });

    test('Use file for inter-process communication', async ({ terminal }) => {
        const COMM_FILE = '/tmp/repterm-ipc-test.txt';

        // 1. Write message in main terminal
        // Note: Must use await to wait for command completion, or use expect() to ensure execution
        const writeProc = terminal.run(`echo "Hello from main terminal" > ${COMM_FILE} && echo "WRITE_DONE"`, { interactive: true });
        await writeProc.expect('WRITE_DONE');  // Use deterministic marker instead of shell prompt
        console.log('  [Main] Message written');

        // 2. Create second terminal
        const secondTerminal = await terminal.create();

        try {
            // 3. Read message in second terminal
            const readProc = secondTerminal.run(`cat ${COMM_FILE}`, { interactive: true });
            await readProc.expect('Hello from main terminal');
            console.log('  [Second] Message read');

            // 4. Append response in second terminal
            const appendProc = secondTerminal.run(`echo "Response from second terminal" >> ${COMM_FILE} && echo "APPEND_DONE"`, { interactive: true });
            await appendProc.expect('APPEND_DONE');
            console.log('  [Second] Response appended');

            // 5. Verify complete content in main terminal
            const verifyProc = terminal.run(`cat ${COMM_FILE}`, { interactive: true });
            await verifyProc.expect('Response from second terminal');
            console.log('  [Main] Verification successful');

        } finally {
            // Cleanup temporary file
            const cleanProc = terminal.run(`rm -f ${COMM_FILE} && echo "CLEANUP_DONE"`, { interactive: true });
            await cleanProc.expect('CLEANUP_DONE');
        }
    });
});
