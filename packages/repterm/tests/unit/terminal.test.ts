/**
 * Unit tests for src/terminal/terminal.ts - Terminal API
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { Terminal, createTerminal } from '../../src/terminal/terminal.js';

describe('Terminal', () => {
    let terminal: Terminal | null = null;

    afterEach(async () => {
        if (terminal) {
            await terminal.close();
            terminal = null;
        }
    });

    describe('constructor', () => {
        test('creates a terminal with default config', () => {
            terminal = new Terminal();
            expect(terminal).toBeInstanceOf(Terminal);
        });

        test('creates a terminal with custom config', () => {
            terminal = new Terminal({
                cols: 100,
                rows: 50,
                recording: false,
            });
            expect(terminal).toBeInstanceOf(Terminal);
        });
    });

    describe('isActive()', () => {
        test('returns false initially', () => {
            terminal = new Terminal();
            expect(terminal.isActive()).toBe(false);
        });
    });

    describe('getTmuxSessionName()', () => {
        test('returns undefined by default', () => {
            terminal = new Terminal();
            expect(terminal.getTmuxSessionName()).toBeUndefined();
        });
    });

    describe('getTmuxPaneId()', () => {
        test('returns undefined by default', () => {
            terminal = new Terminal();
            expect(terminal.getTmuxPaneId()).toBeUndefined();
        });
    });

    describe('getSession()', () => {
        test('returns the session object', () => {
            terminal = new Terminal();
            const session = terminal.getSession();
            expect(session).toBeDefined();
        });
    });

    describe('getSharedState()', () => {
        test('returns the shared state', () => {
            terminal = new Terminal();
            const state = terminal.getSharedState();
            expect(state).toBeDefined();
            expect(state.paneCount).toBe(1);
        });
    });

    describe('incrementPaneCount()', () => {
        test('increments the pane count', () => {
            terminal = new Terminal();
            const initialCount = terminal.getSharedState().paneCount;
            terminal.incrementPaneCount();
            expect(terminal.getSharedState().paneCount).toBe(initialCount + 1);
        });
    });

    describe('close()', () => {
        test('closes the terminal', async () => {
            terminal = new Terminal();
            await terminal.close();
            expect(terminal.isActive()).toBe(false);
        });

        test('handles double close', async () => {
            terminal = new Terminal();
            await terminal.close();
            // Should not throw when closing twice
            await terminal.close();
            expect(terminal.isActive()).toBe(false);
        });
    });

});


describe('createTerminal', () => {
    test('creates a Terminal instance', () => {
        const terminal = createTerminal();
        expect(terminal).toBeInstanceOf(Terminal);
    });

    test('passes config to Terminal', () => {
        const terminal = createTerminal({ cols: 80, rows: 24 });
        expect(terminal).toBeInstanceOf(Terminal);
    });
});

describe('run() with CommandResult', () => {
    let terminal: Terminal | null = null;

    afterEach(async () => {
        if (terminal) {
            await terminal.close();
            terminal = null;
        }
    });

    test('returns PTYProcess that resolves to CommandResult', async () => {
        terminal = createTerminal({ recording: false });
        const proc = terminal.run('echo "hello"');

        // PTYProcess should have then method (PromiseLike)
        expect(typeof proc.then).toBe('function');
        expect(typeof proc.expect).toBe('function');
        expect(typeof proc.send).toBe('function');
        expect(typeof proc.wait).toBe('function');

        // Should resolve to CommandResult when awaited
        const result = await proc;
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('hello');
        expect(result.output).toContain('hello');
    }, 15000);

    test('CommandResult includes duration and command fields', async () => {
        terminal = createTerminal({ recording: false });
        const result = await terminal.run('echo "test"');

        expect(result.code).toBe(0);
        expect(result.command).toBe('echo "test"');
        expect(typeof result.duration).toBe('number');
        expect(result.duration).toBeGreaterThan(0);
        expect(result.successful).toBe(true);
    }, 15000);

    test('returns non-zero exit code without throwing', async () => {
        terminal = createTerminal({ recording: false });
        const result = await terminal.run('exit 42');

        expect(result.code).toBe(42);
        expect(result.successful).toBe(false);
    }, 15000);

    test('separates stdout and stderr via launcher', async () => {
        terminal = createTerminal({ recording: false });
        const result = await terminal.run('echo "out"; echo "err" >&2');

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('out');
        expect(result.stderr).toContain('err');
        expect(result.output).toContain('out');
        expect(result.output).toContain('err');
    }, 15000);

    test('returns stderr in error case', async () => {
        terminal = createTerminal({ recording: false });
        const result = await terminal.run('ls /non-existent-path-12345');

        expect(result.code).not.toBe(0);
        expect(result.successful).toBe(false);
    }, 15000);

    test('output combines stdout and stderr', async () => {
        terminal = createTerminal({ recording: false });
        const result = await terminal.run('echo "stdout"; echo "stderr" >&2');

        expect(result.output).toContain('stdout');
        expect(result.output).toContain('stderr');
    }, 15000);
});
