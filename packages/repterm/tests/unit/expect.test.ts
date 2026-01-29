/**
 * Unit tests for src/api/expect.ts - Assertions
 */

import { describe, test, expect as vitestExpect } from 'bun:test';
import { TerminalExpect, AssertionError, expect } from '../../src/api/expect.js';
import type { TerminalAPI } from '../../src/runner/models.js';

describe('AssertionError', () => {
    test('creates error with message, expected, and actual values', () => {
        const error = new AssertionError('Test failed', 'expected', 'actual');

        vitestExpect(error.message).toBe('Test failed');
        vitestExpect(error.expected).toBe('expected');
        vitestExpect(error.actual).toBe('actual');
        vitestExpect(error.name).toBe('AssertionError');
    });

    test('is instance of Error', () => {
        const error = new AssertionError('msg', 'exp', 'act');
        vitestExpect(error).toBeInstanceOf(Error);
    });
});

describe('expect()', () => {
    test('returns a TerminalExpect instance', () => {
        const mockTerminal = {
            snapshot: async () => 'terminal output',
        } as TerminalAPI;

        const terminalExpect = expect(mockTerminal);
        vitestExpect(terminalExpect).toBeInstanceOf(TerminalExpect);
    });
});

describe('TerminalExpect', () => {
    const createMockTerminal = (output: string): TerminalAPI => ({
        snapshot: async () => output,
        start: async () => { },
        send: async () => { },
        waitForText: async () => { },
        close: async () => { },
        create: async () => ({} as TerminalAPI),
    } as TerminalAPI);

    describe('toContainText', () => {
        test('passes when terminal contains expected text', async () => {
            const terminal = createMockTerminal('Hello, World!');
            const termExpect = new TerminalExpect(terminal);

            // Should not throw
            await termExpect.toContainText('Hello');
        });

        test('throws AssertionError when text not found', async () => {
            const terminal = createMockTerminal('Hello, World!');
            const termExpect = new TerminalExpect(terminal);

            await vitestExpect(termExpect.toContainText('Goodbye')).rejects.toThrow(AssertionError);
        });

        test('includes expected and actual in error', async () => {
            const terminal = createMockTerminal('actual output');
            const termExpect = new TerminalExpect(terminal);

            try {
                await termExpect.toContainText('expected text');
                vitestExpect.fail('Should have thrown');
            } catch (error) {
                vitestExpect(error).toBeInstanceOf(AssertionError);
                vitestExpect((error as AssertionError).expected).toBe('expected text');
                vitestExpect((error as AssertionError).actual).toBe('actual output');
            }
        });
    });

    describe('not_toContainText', () => {
        test('passes when terminal does not contain text', async () => {
            const terminal = createMockTerminal('Hello, World!');
            const termExpect = new TerminalExpect(terminal);

            // Should not throw
            await termExpect.not_toContainText('Goodbye');
        });

        test('throws AssertionError when text is found', async () => {
            const terminal = createMockTerminal('Hello, World!');
            const termExpect = new TerminalExpect(terminal);

            await vitestExpect(termExpect.not_toContainText('Hello')).rejects.toThrow(AssertionError);
        });
    });

    describe('toMatchPattern', () => {
        test('passes when terminal matches regex', async () => {
            const terminal = createMockTerminal('User: john_doe logged in at 10:30');
            const termExpect = new TerminalExpect(terminal);

            // Should not throw
            await termExpect.toMatchPattern(/User: \w+ logged in/);
        });

        test('throws AssertionError when pattern does not match', async () => {
            const terminal = createMockTerminal('Hello, World!');
            const termExpect = new TerminalExpect(terminal);

            await vitestExpect(termExpect.toMatchPattern(/^\d+$/)).rejects.toThrow(AssertionError);
        });
    });
});
