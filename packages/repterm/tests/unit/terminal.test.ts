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

describe('PTY-only mode', () => {
    let terminal: Terminal | null = null;

    afterEach(async () => {
        if (terminal) {
            await terminal.close();
            terminal = null;
        }
    });

    test('creates terminal with ptyOnly config', () => {
        terminal = new Terminal({ ptyOnly: true });
        expect(terminal).toBeInstanceOf(Terminal);
        expect(terminal.isPtyMode()).toBe(true);
        expect(terminal.isRecording()).toBe(false);
    });

    test('isPtyMode() returns true for ptyOnly', () => {
        terminal = createTerminal({ ptyOnly: true });
        expect(terminal.isPtyMode()).toBe(true);
    });

    test('isPtyMode() returns true for recording', () => {
        terminal = createTerminal({ recording: true });
        expect(terminal.isPtyMode()).toBe(true);
    });

    test('isPtyMode() returns false for plain terminal', () => {
        terminal = createTerminal();
        expect(terminal.isPtyMode()).toBe(false);
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

describe('analyzePromptLine', () => {
    test('detects traditional prompt at line end', () => {
        const terminal = new Terminal();
        // Use type assertion to access private method
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        const pattern = analyze('user@host:~$ ');
        expect(pattern).toBeDefined();
        expect(pattern.test('user@host:~$ ')).toBe(true);
    });

    test('detects right-side prompt (Starship style)', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        // Right-side prompt: spaces after ❯ then time
        const line = '  ~/path on main ❯                     at  18:44:46';
        const pattern = analyze(line);
        expect(pattern).toBeDefined();
        expect(pattern.test(line)).toBe(true);
    });

    test('returns undefined for line without prompt char', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        const pattern = analyze('just some text');
        expect(pattern).toBeUndefined();
    });

    test('handles empty input', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        expect(analyze('')).toBeUndefined();
        expect(analyze('\n\n')).toBeUndefined();
    });

    test('detects hash prompt for root user', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        const pattern = analyze('root@server:/# ');
        expect(pattern).toBeDefined();
        expect(pattern.test('root@server:/# ')).toBe(true);
    });

    // --- lastIndexOf behavior (core bug fix) ---

    test('picks last prompt char when multiple appear in single-line PTY output', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        // Simulates stripped PTY output: p10k instant prompt '%' appears early,
        // then real prompt '❯' appears later in the concatenated single line
        const singleLine = '7  ~/path ❯                    at 15:49:188]7;file://host%                    ~/path on main ❯ at 15:49:18';
        const pattern = analyze(singleLine);
        expect(pattern).toBeDefined();
        // Should detect the LAST ❯, not the earlier %
        expect(pattern.test('❯ at 15:49:18')).toBe(true);
        expect(pattern.source).toContain('❯');
    });

    test('prefers final ❯ over earlier % in p10k instant prompt scenario', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        // p10k instant prompt '%' at start, real prompt '❯' at end
        const line = '%                                  ~/project ❯ at 18:00:00';
        const pattern = analyze(line);
        expect(pattern).toBeDefined();
        expect(pattern.source).toContain('❯');
        expect(pattern.test('~/project ❯ at 18:00:00')).toBe(true);
    });

    test('picks last $ when multiple $ appear across lines', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        // Multi-line: analyzePromptLine uses the LAST line
        const input = '$HOME is /home/user\nuser@host:~$ ';
        const pattern = analyze(input);
        expect(pattern).toBeDefined();
        expect(pattern.test('user@host:~$ ')).toBe(true);
    });

    // --- \s+ regex (single space must match) ---

    test('right-side pattern matches single space after prompt char', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        // Only 1 space between ❯ and right-side content
        const line = '  ~/project on main ❯ at 18:00:00';
        const pattern = analyze(line);
        expect(pattern).toBeDefined();
        expect(pattern.test('❯ at 18:00:00')).toBe(true);
    });

    test('right-side pattern matches many spaces after prompt char', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        // Many spaces between ❯ and right-side content
        const line = '  ~/path ❯                    at 18:00:00';
        const pattern = analyze(line);
        expect(pattern).toBeDefined();
        expect(pattern.test('❯                    at 18:00:00')).toBe(true);
    });

    // --- More prompt styles ---

    test('detects fish shell > prompt', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        const pattern = analyze('user@host ~/project> ');
        expect(pattern).toBeDefined();
        expect(pattern.test('~/project> ')).toBe(true);
    });

    test('detects lambda prompt', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        const pattern = analyze('λ ');
        expect(pattern).toBeDefined();
        expect(pattern.test('λ ')).toBe(true);
    });

    test('detects arrow prompt (→)', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        const pattern = analyze('~/project → ');
        expect(pattern).toBeDefined();
        expect(pattern.test('→ ')).toBe(true);
    });

    test('detects prompt char at line end without trailing space', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        // No trailing space — should use (\s|$) branch
        const pattern = analyze('user@host:~$');
        expect(pattern).toBeDefined();
        // Should match at end of string
        expect(pattern.test('user@host:~$')).toBe(true);
        // Should also match with trailing space
        expect(pattern.test('user@host:~$ ')).toBe(true);
    });

    test('returns undefined for whitespace-only lines', () => {
        const terminal = new Terminal();
        const analyze = (terminal as any).analyzePromptLine.bind(terminal);

        expect(analyze('   \n   ')).toBeUndefined();
    });
});

describe('getDetectedPromptPattern', () => {
    test('returns undefined before detection', () => {
        const terminal = new Terminal();
        expect(terminal.getDetectedPromptPattern()).toBeUndefined();
    });
});

describe('waitForText event-driven (non-recording)', () => {
    let terminal: Terminal | null = null;

    afterEach(async () => {
        if (terminal) {
            await terminal.close();
            terminal = null;
        }
    });

    test('resolves immediately if text already in buffer', async () => {
        terminal = new Terminal();
        terminal.appendNonInteractiveOutput('expected text here');

        const start = Date.now();
        await terminal.waitForText('expected text', { timeout: 5000 });
        const elapsed = Date.now() - start;

        // Should resolve near-instantly, not wait for any polling interval
        expect(elapsed).toBeLessThan(50);
    });

    test('resolves when appendNonInteractiveOutput adds matching text', async () => {
        terminal = new Terminal();

        setTimeout(() => {
            terminal!.appendNonInteractiveOutput('delayed output');
        }, 50);

        await terminal.waitForText('delayed output', { timeout: 2000 });
    });

    test('throws on timeout with correct error message', async () => {
        terminal = new Terminal();

        try {
            await terminal.waitForText('never appears', { timeout: 200 });
            throw new Error('Should have thrown');
        } catch (e: any) {
            expect(e.message).toBe('Timeout waiting for text "never appears" after 200ms');
        }
    });

    test('handles text split across multiple appendNonInteractiveOutput calls', async () => {
        terminal = new Terminal();

        setTimeout(() => {
            terminal!.appendNonInteractiveOutput('hel');
        }, 30);
        setTimeout(() => {
            terminal!.appendNonInteractiveOutput('lo world');
        }, 60);

        await terminal.waitForText('hello', { timeout: 2000 });
    });
});

describe('waitForOutputStable event-driven (non-recording)', () => {
    let terminal: Terminal | null = null;

    afterEach(async () => {
        if (terminal) {
            await terminal.close();
            terminal = null;
        }
    });

    test('does not throw on timeout', async () => {
        terminal = new Terminal();

        // Should resolve silently even if no prompt appears
        await terminal.waitForOutputStablePublic(100);
    });

    // --- afterOffset behavior ---

    test('afterOffset prevents matching old prompt in buffer', async () => {
        terminal = new Terminal();
        // Set a detected prompt pattern
        (terminal as any).detectedPromptPattern = /\$(\s|$)/;

        // Simulate existing output with prompt
        const session = terminal.getSession();
        (session as any).outputBuffer = 'user@host:~$ ';
        const offset = (session as any).outputBuffer.length;

        // With afterOffset, the old prompt should NOT match
        const start = Date.now();
        await terminal.waitForOutputStablePublic(300, offset);
        const elapsed = Date.now() - start;

        // Should have waited close to the full timeout (not resolved instantly)
        expect(elapsed).toBeGreaterThanOrEqual(250);
    });

    test('afterOffset allows matching new prompt after offset', async () => {
        terminal = new Terminal();
        (terminal as any).detectedPromptPattern = /\$(\s|$)/;

        const session = terminal.getSession();
        (session as any).outputBuffer = 'user@host:~$ ';
        const offset = (session as any).outputBuffer.length;

        // Verify the session is the same object used internally
        expect(session).toBe((terminal as any).session);

        // Simulate new output arriving after 100ms (with prompt)
        setTimeout(() => {
            (session as any).outputBuffer += 'command output\nuser@host:~$ ';
            session.emit('data', 'new data');
        }, 100);

        const start = Date.now();
        await terminal.waitForOutputStablePublic(5000, offset);
        const elapsed = Date.now() - start;

        // Should resolve after new data arrives, not wait full timeout
        expect(elapsed).toBeLessThan(2000);
    });
});

describe('prompt detection on shell ready', () => {
    let terminal: Terminal | null = null;

    afterEach(async () => {
        if (terminal) {
            await terminal.close();
            terminal = null;
        }
    });

    test('detectPromptFromOutput sets pattern from session output', () => {
        terminal = new Terminal();
        const session = terminal.getSession();
        (session as any).outputBuffer = 'user@host:~$ ';

        (terminal as any).detectPromptFromOutput();

        const pattern = terminal.getDetectedPromptPattern();
        expect(pattern).toBeDefined();
        expect(pattern!.test('user@host:~$ ')).toBe(true);
    });

    test('detectPromptFromOutput does not overwrite existing pattern', () => {
        terminal = new Terminal();
        const existingPattern = /custom-pattern/;
        (terminal as any).detectedPromptPattern = existingPattern;

        const session = terminal.getSession();
        (session as any).outputBuffer = 'user@host:~$ ';

        (terminal as any).detectPromptFromOutput();

        expect(terminal.getDetectedPromptPattern()).toBe(existingPattern);
    });

    test('detectPromptFromOutput handles empty output gracefully', () => {
        terminal = new Terminal();
        (terminal as any).detectPromptFromOutput();

        expect(terminal.getDetectedPromptPattern()).toBeUndefined();
    });

    test('detectPromptFromOutput strips ANSI before analysis', () => {
        terminal = new Terminal();
        const session = terminal.getSession();
        (session as any).outputBuffer = '\x1b[32muser@host\x1b[0m:\x1b[34m~\x1b[0m$ ';

        (terminal as any).detectPromptFromOutput();

        const pattern = terminal.getDetectedPromptPattern();
        expect(pattern).toBeDefined();
        expect(pattern!.test('user@host:~$ ')).toBe(true);
    });

    // --- ANSI/OSC edge cases ---

    test('detectPromptFromOutput strips CSI with parameter prefixes (> not misdetected)', () => {
        terminal = new Terminal();
        const session = terminal.getSession();
        // CSI >0q and CSI ?1049h contain '>' and '?' which are NOT prompt chars
        (session as any).outputBuffer = '\x1b[>0q\x1b[?1049h user@host:~$ ';

        (terminal as any).detectPromptFromOutput();

        const pattern = terminal.getDetectedPromptPattern();
        expect(pattern).toBeDefined();
        // Should detect '$', not '>' from the CSI sequence
        expect(pattern!.source).toContain('\\$');
    });

    test('detectPromptFromOutput handles OSC 7 sequences in p10k output', () => {
        terminal = new Terminal();
        const session = terminal.getSession();
        // OSC 7 (file URI) followed by p10k prompt with ❯
        (session as any).outputBuffer = '\x1b]7;file://hostname/Users/user/project\x07  ~/project ❯   at 18:00';

        (terminal as any).detectPromptFromOutput();

        const pattern = terminal.getDetectedPromptPattern();
        expect(pattern).toBeDefined();
        expect(pattern!.source).toContain('❯');
    });

    test('detectPromptFromOutput returns undefined for ANSI-only output without prompt', () => {
        terminal = new Terminal();
        const session = terminal.getSession();
        (session as any).outputBuffer = '\x1b[32msome text\x1b[0m';

        (terminal as any).detectPromptFromOutput();

        expect(terminal.getDetectedPromptPattern()).toBeUndefined();
    });
});
