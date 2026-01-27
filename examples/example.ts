import { describe, test, expect } from 'repterm';

// Standalone test (not in a suite)
test('echo command', async ({ terminal }) => {
  await terminal.start('echo "Hello, world"');
  await terminal.waitForText('Hello, world', { timeout: 5000 });
  await expect(terminal).toContainText('Hello, world');
});

// Tests grouped in a suite using describe()
describe('Basic Commands', () => {
  test('pwd command', async ({ terminal }) => {
    await terminal.start('pwd');
    await terminal.waitForText('/', { timeout: 5000 });
  });

  test('date command', async ({ terminal }) => {
    await terminal.start('date');
    await terminal.waitForText('2', { timeout: 5000 }); // Will match year
  });
});