/**
 * Unit tests for src/terminal/tmux.ts - Tmux integration
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TmuxSession, createTmuxSession, checkTmuxAvailable } from '../../src/terminal/tmux.js';

describe('TmuxSession', () => {
    describe('constructor', () => {
        test('creates a TmuxSession with config', () => {
            const session = new TmuxSession({
                sessionName: 'test-session',
                cols: 120,
                rows: 40,
            });
            expect(session).toBeInstanceOf(TmuxSession);
            expect(session.getSessionName()).toBe('test-session');
        });
    });

    describe('getSessionName()', () => {
        test('returns the session name', () => {
            const session = new TmuxSession({ sessionName: 'my-session' });
            expect(session.getSessionName()).toBe('my-session');
        });
    });

    describe('getPaneIds()', () => {
        test('returns empty array initially', () => {
            const session = new TmuxSession({ sessionName: 'test' });
            expect(session.getPaneIds()).toEqual([]);
        });

        test('returns a copy of pane IDs', () => {
            const session = new TmuxSession({ sessionName: 'test' });
            const ids1 = session.getPaneIds();
            const ids2 = session.getPaneIds();
            expect(ids1).not.toBe(ids2);
        });
    });
});

describe('createTmuxSession', () => {
    test('creates a TmuxSession instance', () => {
        const session = createTmuxSession({ sessionName: 'new-session' });
        expect(session).toBeInstanceOf(TmuxSession);
    });
});

describe('checkTmuxAvailable', () => {
    test('returns boolean indicating tmux availability', async () => {
        const available = await checkTmuxAvailable();
        expect(typeof available).toBe('boolean');
    });
});

describe('TmuxSession integration', () => {
    let session: TmuxSession | null = null;

    beforeEach(() => {
        const sessionName = `test-${Date.now()}`;
        session = new TmuxSession({ sessionName, cols: 80, rows: 24 });
    });

    afterEach(async () => {
        if (session) {
            await session.kill();
            session = null;
        }
    });

    test('creates and kills a session', async () => {
        const available = await checkTmuxAvailable();
        if (!available) {
            // Skip if tmux not installed
            return;
        }

        await session!.create();
        const paneIds = session!.getPaneIds();
        expect(paneIds.length).toBeGreaterThan(0);

        await session!.kill();
    }, 10000);
});
