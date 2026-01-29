/**
 * Unit tests for src/api/expect.ts - Assertions
 */

import { describe, test, expect as vitestExpect } from 'bun:test';
import { TerminalExpect, CommandResultExpect, AssertionError, expect } from '../../src/api/expect.js';
import type { TerminalAPI, CommandResult } from '../../src/runner/models.js';

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
    test('returns a TerminalExpect instance for terminal', () => {
        const mockTerminal = {
            run: () => { },
            snapshot: async () => 'terminal output',
        } as unknown as TerminalAPI;

        const terminalExpect = expect(mockTerminal);
        vitestExpect(terminalExpect).toBeInstanceOf(TerminalExpect);
    });

    test('returns a CommandResultExpect instance for command result', () => {
        const mockResult: CommandResult = {
            code: 0,
            stdout: 'hello',
            stderr: '',
            output: 'hello',
            duration: 100,
            command: 'echo hello',
            successful: true,
        };

        const resultExpect = expect(mockResult);
        vitestExpect(resultExpect).toBeInstanceOf(CommandResultExpect);
    });
});

describe('TerminalExpect', () => {
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

    describe('not.toContainText', () => {
        test('passes when terminal does not contain text', async () => {
            const terminal = createMockTerminal('Hello, World!');
            const termExpect = new TerminalExpect(terminal);

            // Should not throw
            await termExpect.not.toContainText('Goodbye');
        });

        test('throws AssertionError when text is found', async () => {
            const terminal = createMockTerminal('Hello, World!');
            const termExpect = new TerminalExpect(terminal);

            await vitestExpect(termExpect.not.toContainText('Hello')).rejects.toThrow(AssertionError);
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

describe('CommandResultExpect', () => {
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
            const resultExpect = new CommandResultExpect(result);

            // Should not throw
            resultExpect.toSucceed();
        });

        test('throws when code is not 0', () => {
            const result = createMockResult({ code: 1 });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.toSucceed()).toThrow(AssertionError);
        });

        test('supports chaining', () => {
            const result = createMockResult({ code: 0 });
            const resultExpect = new CommandResultExpect(result);

            const returned = resultExpect.toSucceed();
            vitestExpect(returned).toBe(resultExpect);
        });
    });

    describe('toFail', () => {
        test('passes when code is not 0', () => {
            const result = createMockResult({ code: 1 });
            const resultExpect = new CommandResultExpect(result);

            resultExpect.toFail();
        });

        test('throws when code is 0', () => {
            const result = createMockResult({ code: 0 });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.toFail()).toThrow(AssertionError);
        });
    });

    describe('toHaveExitCode', () => {
        test('passes when code matches', () => {
            const result = createMockResult({ code: 42 });
            const resultExpect = new CommandResultExpect(result);

            resultExpect.toHaveExitCode(42);
        });

        test('throws when code does not match', () => {
            const result = createMockResult({ code: 1 });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.toHaveExitCode(0)).toThrow(AssertionError);
        });
    });

    describe('toHaveStdout', () => {
        test('passes when stdout contains text', () => {
            const result = createMockResult({ stdout: 'hello world' });
            const resultExpect = new CommandResultExpect(result);

            resultExpect.toHaveStdout('hello');
        });

        test('throws when stdout does not contain text', () => {
            const result = createMockResult({ stdout: 'hello' });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.toHaveStdout('goodbye')).toThrow(AssertionError);
        });
    });

    describe('toHaveStderr', () => {
        test('passes when stderr contains text', () => {
            const result = createMockResult({ stderr: 'error message' });
            const resultExpect = new CommandResultExpect(result);

            resultExpect.toHaveStderr('error');
        });

        test('throws when stderr does not contain text', () => {
            const result = createMockResult({ stderr: '' });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.toHaveStderr('error')).toThrow(AssertionError);
        });
    });

    describe('toMatchStdout', () => {
        test('passes when stdout matches pattern', () => {
            const result = createMockResult({ stdout: 'version 1.2.3' });
            const resultExpect = new CommandResultExpect(result);

            resultExpect.toMatchStdout(/version \d+\.\d+\.\d+/);
        });

        test('throws when stdout does not match pattern', () => {
            const result = createMockResult({ stdout: 'hello' });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.toMatchStdout(/^\d+$/)).toThrow(AssertionError);
        });
    });

    describe('toContainInOutput', () => {
        test('passes when output contains text', () => {
            const result = createMockResult({ output: 'combined output' });
            const resultExpect = new CommandResultExpect(result);

            resultExpect.toContainInOutput('combined');
        });

        test('throws when output does not contain text', () => {
            const result = createMockResult({ output: 'hello' });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.toContainInOutput('goodbye')).toThrow(AssertionError);
        });
    });

    describe('chaining', () => {
        test('supports multiple chained assertions', () => {
            const result = createMockResult({
                code: 0,
                stdout: 'hello world',
                stderr: '',
            });
            const resultExpect = new CommandResultExpect(result);

            // Should not throw
            resultExpect
                .toSucceed()
                .toHaveStdout('hello')
                .toHaveStdout('world');
        });
    });

    describe('not assertions', () => {
        test('not.toSucceed passes when code is not 0', () => {
            const result = createMockResult({ code: 1 });
            const resultExpect = new CommandResultExpect(result);

            resultExpect.not.toSucceed();
        });

        test('not.toSucceed throws when code is 0', () => {
            const result = createMockResult({ code: 0 });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.not.toSucceed()).toThrow(AssertionError);
        });

        test('not.toContainInOutput passes when text not found', () => {
            const result = createMockResult({ output: 'hello' });
            const resultExpect = new CommandResultExpect(result);

            resultExpect.not.toContainInOutput('error');
        });

        test('not.toContainInOutput throws when text found', () => {
            const result = createMockResult({ output: 'error occurred' });
            const resultExpect = new CommandResultExpect(result);

            vitestExpect(() => resultExpect.not.toContainInOutput('error')).toThrow(AssertionError);
        });
    });
});
