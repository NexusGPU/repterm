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
