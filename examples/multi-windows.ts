/**
 * Multi-window HTTP server test example
 *
 * This test demonstrates:
 * 1. Starting an HTTP server in one terminal window
 * 2. Making requests to the server from another terminal window
 * 3. Validating the response data
 */
import { test, expect } from 'repterm';

test('multi-window: POST request with body', async ({ terminal: serverTerminal }) => {
  // Terminal 1: Start server that handles POST requests
  await serverTerminal.start(`cat > /tmp/post-server.js << 'SCRIPT'
const http = require('http');
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      received: body,
      method: req.method,
      contentType: req.headers['content-type']
    }));
  });
});
server.listen(8768, () => console.log('POST server ready on port 8768'));
SCRIPT`);

  await serverTerminal.start('node /tmp/post-server.js');
  await serverTerminal.waitForText('POST server ready on port 8768', { timeout: 10000 });

  // Terminal 2: Client terminal (created as a pane in the same tmux session)
  const clientTerminal = await serverTerminal.create();

  // Send POST request with JSON body
  await clientTerminal.start(
    `curl -s -X POST -H "Content-Type: application/json" -d '{"name":"repterm","version":"1.0"}' http://localhost:8768/`
  );

  // Validate server received the POST body
  // Wait for 'received' which only appears in the response JSON, not in the command
  await clientTerminal.waitForText('received', { timeout: 5000 });
  
  // Note: Due to line wrapping in narrow panes, we check for substrings
  // that are likely to be on a single line
  await expect(clientTerminal).toContainText('"POST"');
  await expect(clientTerminal).toContainText('received');
  await expect(clientTerminal).toContainText('repterm');
  
  // Note: Don't manually close the client terminal - let the framework handle cleanup
  // This ensures the multi-pane view is captured in the recording
});