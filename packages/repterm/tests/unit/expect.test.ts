/**
 * Unit tests for src/api/expect.ts - Assertions based on bun:test expect.extend()
 */

import { describe, test, expect as bunExpect } from 'bun:test';
import { AssertionError, expect } from '../../src/api/expect.js';
import type { TerminalAPI, CommandResult } from '../../src/runner/models.js';

describe('AssertionError', () => {
    test('creates error with message, expected, and actual values', () => {
        const error = new AssertionError('Test failed', 'expected', 'actual');

        bunExpect(error.message).toBe('Test failed');
        bunExpect(error.expected).toBe('expected');
        bunExpect(error.actual).toBe('actual');
        bunExpect(error.name).toBe('AssertionError');
    });

    test('is instance of Error', () => {
        const error = new AssertionError('msg', 'exp', 'act');
        bunExpect(error).toBeInstanceOf(Error);
    });
});

describe('expect() - repterm re-export', () => {
    test('expect is a function (bun:test expect with repterm matchers)', () => {
        expect(typeof expect).toBe('function');
    });
});

describe('Terminal matchers', () => {
    const createMockTerminal = (output: string): TerminalAPI => ({
        run: () => ({} as any),
        snapshot: async () => output,
        send: async () => { },
        waitForText: async () => { },
        close: async () => { },
        create: async () => ({} as TerminalAPI),
    } as TerminalAPI);

    describe('toContainText', () => {
        test('passes when terminal contains expected text', async () => {
            const terminal = createMockTerminal('Hello, World!');
            await expect(terminal).toContainText('Hello');
        });

        test('throws when text not found', async () => {
            const terminal = createMockTerminal('Hello, World!');
            bunExpect(async () => {
                await expect(terminal).toContainText('Goodbye');
            }).toThrow();
        });
    });

    describe('not.toContainText', () => {
        test('passes when terminal does not contain text', async () => {
            const terminal = createMockTerminal('Hello, World!');
            await expect(terminal).not.toContainText('Goodbye');
        });

        test('throws when text is found', async () => {
            const terminal = createMockTerminal('Hello, World!');
            bunExpect(async () => {
                await expect(terminal).not.toContainText('Hello');
            }).toThrow();
        });
    });

    describe('toMatchPattern', () => {
        test('passes when terminal matches regex', async () => {
            const terminal = createMockTerminal('User: john_doe logged in at 10:30');
            await expect(terminal).toMatchPattern(/User: \w+ logged in/);
        });

        test('throws when pattern does not match', async () => {
            const terminal = createMockTerminal('Hello, World!');
            bunExpect(async () => {
                await expect(terminal).toMatchPattern(/^\d+$/);
            }).toThrow();
        });
    });
});

describe('CommandResult matchers', () => {
    const createMockResult = (overrides: Partial<CommandResult> = {}): CommandResult => ({
        code: 0,
        stdout: 'hello world',
        stderr: '',
        output: 'hello world',
        duration: 100,
        command: 'echo hello',
        successful: true,
        ...overrides,
    });

    describe('toSucceed', () => {
        test('passes when code is 0', () => {
            const result = createMockResult({ code: 0 });
            expect(result).toSucceed();
        });

        test('throws when code is not 0', () => {
            const result = createMockResult({ code: 1 });
            bunExpect(() => expect(result).toSucceed()).toThrow();
        });
    });

    describe('toFail', () => {
        test('passes when code is not 0', () => {
            const result = createMockResult({ code: 1 });
            expect(result).toFail();
        });

        test('throws when code is 0', () => {
            const result = createMockResult({ code: 0 });
            bunExpect(() => expect(result).toFail()).toThrow();
        });
    });

    describe('toHaveExitCode', () => {
        test('passes when code matches', () => {
            const result = createMockResult({ code: 42 });
            expect(result).toHaveExitCode(42);
        });

        test('throws when code does not match', () => {
            const result = createMockResult({ code: 1 });
            bunExpect(() => expect(result).toHaveExitCode(0)).toThrow();
        });
    });

    describe('toHaveStdout', () => {
        test('passes when stdout contains text', () => {
            const result = createMockResult({ stdout: 'hello world' });
            expect(result).toHaveStdout('hello');
        });

        test('throws when stdout does not contain text', () => {
            const result = createMockResult({ stdout: 'hello' });
            bunExpect(() => expect(result).toHaveStdout('goodbye')).toThrow();
        });
    });

    describe('toHaveStderr', () => {
        test('passes when stderr contains text', () => {
            const result = createMockResult({ stderr: 'error message' });
            expect(result).toHaveStderr('error');
        });

        test('throws when stderr does not contain text', () => {
            const result = createMockResult({ stderr: '' });
            bunExpect(() => expect(result).toHaveStderr('error')).toThrow();
        });
    });

    describe('toMatchStdout', () => {
        test('passes when stdout matches pattern', () => {
            const result = createMockResult({ stdout: 'version 1.2.3' });
            expect(result).toMatchStdout(/version \d+\.\d+\.\d+/);
        });

        test('throws when stdout does not match pattern', () => {
            const result = createMockResult({ stdout: 'hello' });
            bunExpect(() => expect(result).toMatchStdout(/^\d+$/)).toThrow();
        });
    });

    describe('toMatchStderr', () => {
        test('passes when stderr matches pattern', () => {
            const result = createMockResult({ stderr: 'Error: ENOENT' });
            expect(result).toMatchStderr(/Error: \w+/);
        });

        test('throws when stderr does not match pattern', () => {
            const result = createMockResult({ stderr: 'hello' });
            bunExpect(() => expect(result).toMatchStderr(/^\d+$/)).toThrow();
        });
    });

    describe('toContainInOutput', () => {
        test('passes when output contains text', () => {
            const result = createMockResult({ output: 'combined output' });
            expect(result).toContainInOutput('combined');
        });

        test('throws when output does not contain text', () => {
            const result = createMockResult({ output: 'hello' });
            bunExpect(() => expect(result).toContainInOutput('goodbye')).toThrow();
        });
    });

    describe('not assertions', () => {
        test('not.toSucceed passes when code is not 0', () => {
            const result = createMockResult({ code: 1 });
            expect(result).not.toSucceed();
        });

        test('not.toSucceed throws when code is 0', () => {
            const result = createMockResult({ code: 0 });
            bunExpect(() => expect(result).not.toSucceed()).toThrow();
        });

        test('not.toContainInOutput passes when text not found', () => {
            const result = createMockResult({ output: 'hello' });
            expect(result).not.toContainInOutput('error');
        });

        test('not.toContainInOutput throws when text found', () => {
            const result = createMockResult({ output: 'error occurred' });
            bunExpect(() => expect(result).not.toContainInOutput('error')).toThrow();
        });
    });
});
