/**
 * Example demonstrating describe() API for creating test suites
 * Similar to Vitest's describe() for grouping related tests
 */
import { describe, test, expect } from 'repterm';

// Create a test suite for echo command tests
describe('Echo Commands', () => {
    test('echo simple text', async ({ terminal }) => {
        await terminal.start('echo "Hello, world"');
        await terminal.waitForText('Hello, world', { timeout: 5000 });
        await expect(terminal).toContainText('Hello, world');
    });

    test('echo with special characters', async ({ terminal }) => {
        await terminal.start('echo "Hello $USER"');
        await terminal.waitForText('Hello', { timeout: 5000 });
    });
});

// Nested describe blocks - similar to Vitest's API
describe('File Operations', () => {
    describe('Reading Files', () => {
        test('cat command', async ({ terminal }) => {
            await terminal.start('echo "content" > /tmp/test.txt && cat /tmp/test.txt');
            await terminal.waitForText('content', { timeout: 5000 });
        });

        test('head command', async ({ terminal }) => {
            await terminal.start('echo "line1\\nline2" > /tmp/head_test.txt && head -n 1 /tmp/head_test.txt');
            await terminal.waitForText('line1', { timeout: 5000 });
        });
    });

    describe('Writing Files', () => {
        test('create file with echo', async ({ terminal }) => {
            await terminal.start('echo "test" > /tmp/describe-test.txt');
            await terminal.waitForText('test', { timeout: 5000 });
        });
    });

    // Test at parent level
    test('list directory', async ({ terminal }) => {
        await terminal.start('ls -la');
        await terminal.waitForText('total', { timeout: 5000 });
    });
});
