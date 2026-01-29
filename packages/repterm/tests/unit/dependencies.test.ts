/**
 * Unit tests for src/utils/dependencies.ts - Dependency checking
 */

import { describe, test, expect } from 'bun:test';
import { checkCommand, checkDependencies } from '../../src/utils/dependencies.js';

describe('checkCommand', () => {
    test('returns true for available commands', async () => {
        // 'ls' should be available on all Unix systems
        const result = await checkCommand('ls');
        expect(result).toBe(true);
    });

    test('returns true for node', async () => {
        const result = await checkCommand('node');
        expect(result).toBe(true);
    });

    test('returns false for non-existent commands', async () => {
        const result = await checkCommand('nonexistent-command-12345');
        expect(result).toBe(false);
    });
});

describe('checkDependencies', () => {
    test('returns all present when recording is false', async () => {
        const result = await checkDependencies(false);

        expect(result.allPresent).toBe(true);
        expect(result.missing).toEqual([]);
    });

    test('returns all present when recording is not specified', async () => {
        const result = await checkDependencies();

        expect(result.allPresent).toBe(true);
        expect(result.missing).toEqual([]);
    });

    test('checks asciinema and tmux when recording is true', async () => {
        const result = await checkDependencies(true);

        // Result depends on whether asciinema/tmux are installed
        // Just verify the structure
        expect(typeof result.allPresent).toBe('boolean');
        expect(Array.isArray(result.missing)).toBe(true);
    });
});
