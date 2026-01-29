/**
 * Integration tests for Terminal module
 * Tests terminal initialization, command execution, and output handling
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { Terminal, createTerminal } from '../../src/terminal/terminal.js';
import { sleep } from '../../src/utils/timing.js';

describe('Terminal Integration', () => {
    let terminal: Terminal | null = null;

    afterEach(async () => {
        if (terminal) {
            await terminal.close();
            terminal = null;
        }
    });

    describe('start() and snapshot()', () => {
        test('starts a command and captures output', async () => {
            terminal = createTerminal({ recording: false });

            await terminal.start('echo "Hello Integration Test"');
            await sleep(500);

            const output = await terminal.snapshot();
            expect(output).toContain('Hello Integration Test');
        }, 10000);

        test('runs multiple commands sequentially', async () => {
            terminal = createTerminal({ recording: false });

            await terminal.start('echo "First"');
            await sleep(300);
            await terminal.start('echo "Second"');
            await sleep(300);

            const output = await terminal.snapshot();
            expect(output).toContain('First');
            expect(output).toContain('Second');
        }, 10000);
    });

    describe('waitForText()', () => {
        test('waits for specific text to appear', async () => {
            terminal = createTerminal({ recording: false });

            await terminal.start('sleep 0.2 && echo "Delayed Output"');
            await terminal.waitForText('Delayed Output', { timeout: 5000 });

            const output = await terminal.snapshot();
            expect(output).toContain('Delayed Output');
        }, 10000);

        test('throws on timeout when text not found', async () => {
            terminal = createTerminal({ recording: false });

            await terminal.start('echo "Something Else"');

            await expect(
                terminal.waitForText('NonExistentText', { timeout: 500 })
            ).rejects.toThrow('Timeout waiting for text');
        }, 10000);
    });

    describe('send()', () => {
        test('sends input to terminal', async () => {
            terminal = createTerminal({ recording: false });

            // Start shell and send input
            await terminal.start('cat');
            await sleep(200);
            await terminal.send('Hello from send\n');
            await sleep(300);

            const output = await terminal.snapshot();
            expect(output).toContain('Hello from send');

            // Send Ctrl+D to exit cat
            await terminal.send('\x04');
        }, 10000);
    });

    describe('isActive()', () => {
        test('returns true when terminal is running', async () => {
            terminal = createTerminal({ recording: false });
            await terminal.start('sleep 10');
            await sleep(100);

            expect(terminal.isActive()).toBe(true);
        }, 10000);

        test('returns false after close', async () => {
            terminal = createTerminal({ recording: false });
            await terminal.start('echo test');
            await terminal.close();

            expect(terminal.isActive()).toBe(false);
        }, 10000);
    });

    describe('create() - multi-terminal', () => {
        test('creates independent terminal in non-recording mode', async () => {
            terminal = createTerminal({ recording: false });

            const secondTerminal = await terminal.create();
            expect(secondTerminal).toBeInstanceOf(Terminal);

            await secondTerminal.close();
        }, 10000);
    });
});

