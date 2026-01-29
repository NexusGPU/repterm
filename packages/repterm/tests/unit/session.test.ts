/**
 * Unit tests for src/terminal/session.ts - Terminal session
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { TerminalSession, createSession } from '../../src/terminal/session.js';

describe('TerminalSession', () => {
    let session: TerminalSession | null = null;

    afterEach(() => {
        if (session) {
            session.kill();
            session = null;
        }
    });

    describe('constructor', () => {
        test('creates a session with default config', () => {
            session = new TerminalSession();
            expect(session).toBeInstanceOf(TerminalSession);
        });

        test('creates a session with custom config', () => {
            session = new TerminalSession({
                cols: 100,
                rows: 50,
            });
            expect(session).toBeInstanceOf(TerminalSession);
        });
    });

    describe('isActive()', () => {
        test('returns false before start', () => {
            session = new TerminalSession();
            expect(session.isActive()).toBe(false);
        });

        test('returns true after start', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            expect(session.isActive()).toBe(true);
        });

        test('returns false after kill', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            session.kill();
            expect(session.isActive()).toBe(false);
        });
    });

    describe('start()', () => {
        test('starts a session with default shell', () => {
            session = new TerminalSession();
            session.start();
            expect(session.isActive()).toBe(true);
        });

        test('starts a session with custom shell', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            expect(session.isActive()).toBe(true);
        });

        test('throws if already started', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            expect(() => session!.start()).toThrow('Terminal session already started');
        });
    });

    describe('write()', () => {
        test('throws if session not started', () => {
            session = new TerminalSession();
            expect(() => session!.write('test')).toThrow('Terminal session not started');
        });

        test('writes data to the terminal', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            // Should not throw
            session.write('echo test\n');
        });
    });

    describe('getOutput() / clearOutput()', () => {
        test('getOutput returns empty string initially', () => {
            session = new TerminalSession();
            expect(session.getOutput()).toBe('');
        });

        test('clears output buffer', () => {
            session = new TerminalSession();
            session.clearOutput();
            expect(session.getOutput()).toBe('');
        });
    });

    describe('resize()', () => {
        test('throws if session not started', () => {
            session = new TerminalSession();
            expect(() => session!.resize(100, 50)).toThrow('Terminal session not started');
        });

        test('resizes the terminal', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            // Should not throw
            session.resize(100, 50);
        });
    });

    describe('getPid()', () => {
        test('returns undefined before start', () => {
            session = new TerminalSession();
            expect(session.getPid()).toBeUndefined();
        });

        test('returns pid after start', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            expect(session.getPid()).toBeGreaterThan(0);
        });
    });

    describe('kill()', () => {
        test('kills the terminal process', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            session.kill();
            expect(session.isActive()).toBe(false);
        });

        test('does not throw if called multiple times', () => {
            session = new TerminalSession();
            session.start({ shell: '/bin/bash' });
            session.kill();
            expect(() => session!.kill()).not.toThrow();
        });
    });
});

describe('createSession', () => {
    test('creates a TerminalSession instance', () => {
        const session = createSession();
        expect(session).toBeInstanceOf(TerminalSession);
    });

    test('passes config to TerminalSession', () => {
        const session = createSession({ cols: 120, rows: 40 });
        expect(session).toBeInstanceOf(TerminalSession);
    });
});
