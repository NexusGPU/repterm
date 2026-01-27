## Quickstart

### Prerequisites
- Node.js 20.11.0
- `asciinema` and `tmux` installed for recording mode

### Install (local development)
```bash
npm install
```

### Example: Run a single terminal test
```ts
import { test, expect } from 'repterm';

test('cli test!!', async ({ terminal }) => {
  await terminal.start('echo "Hello, world!"');
  // Wait for the output to appear
  await terminal.waitForText('Hello, world!', { timeout: 5000 });
  await expect(terminal).toContainText('Hello, world!');
});
```

### Example: Run a multi-terminal test
```ts
/**
 * Multi-window HTTP server test example
 *
 * This test demonstrates:
 * 1. Starting an HTTP server in one terminal window
 * 2. Making requests to the server from another terminal window
 * 3. Validating the response data
 */
import { test, expect, terminalFactory } from 'repterm';

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
  const clientTerminal = await terminalFactory.create();

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
```

### Example: Organized test suites with test.describe

```ts
import { test, describe, expect } from 'repterm';

describe('Authentication', () => {
  test('should login successfully', async ({ terminal }) => {
    await terminal.start('echo "Login successful"');
    await expect(terminal).toContainText('Login successful');
  });

  test('should handle invalid credentials', async ({ terminal }) => {
    await terminal.start('echo "Invalid credentials"');
    await expect(terminal).toContainText('Invalid credentials');
  });
});

describe('User Profile', () => {
  test('should display user info', async ({ terminal }) => {
    await terminal.start('echo "User: admin"');
    await expect(terminal).toContainText('User: admin');
  });
});
```

### Example: Using test.step for better test organization

```ts
import { test, expect } from 'repterm';

test('database migration', async ({ terminal }) => {
  await test.step('Connect to database', async () => {
    await terminal.start('psql -U postgres');
    await terminal.waitForText('postgres=#', { timeout: 5000 });
  });

  await test.step('Run migration', async () => {
    await terminal.start('\\i migrations/001_create_users.sql');
    await expect(terminal).toContainText('CREATE TABLE');
  });

  await test.step('Verify schema', async () => {
    await terminal.start('\\dt');
    await expect(terminal).toContainText('users');
  });
});
```

### Example: Using hooks for setup and teardown

```ts
import { test, beforeEach, afterEach, expect } from 'repterm';

beforeEach(async ({ terminal }) => {
  // Setup before each test
  await terminal.start('mkdir -p /tmp/test-data');
});

afterEach(async ({ terminal }) => {
  // Cleanup after each test
  await terminal.start('rm -rf /tmp/test-data');
});

test('should use temp directory', async ({ terminal }) => {
  await terminal.start('ls /tmp/test-data');
  await expect(terminal).toContainText('test-data');
});
```

## CLI Usage

### Run tests (non-recorded)
```bash
repterm tests/example.test.ts
```

### Run tests with recording enabled
```bash
repterm --record tests/example.test.ts
```

### Run tests in parallel with 4 workers
```bash
repterm --workers 4 tests/
```

### Run tests with custom timeout
```bash
repterm --timeout 60000 tests/
```

### Run tests with verbose output
```bash
repterm --verbose tests/
```

### Show help
```bash
repterm --help
```
