/**
 * Unit tests for src/index.ts - Public API exports
 */

import { describe, test, expect } from 'bun:test';
import * as repterm from '../../src/index.js';

describe('repterm public API', () => {
    describe('core exports', () => {
        test('exports test, expect, describe, step, getTests, clearTests', () => {
            expect(repterm.test).toBeTypeOf('function');
            expect(repterm.expect).toBeTypeOf('function');
            expect(repterm.describe).toBeTypeOf('function');
            expect(repterm.step).toBeTypeOf('function');
            expect(repterm.getTests).toBeTypeOf('function');
            expect(repterm.clearTests).toBeTypeOf('function');
        });
    });

    describe('hooks exports', () => {
        test('exports beforeEach and afterEach', () => {
            expect(repterm.beforeEach).toBeTypeOf('function');
            expect(repterm.afterEach).toBeTypeOf('function');
        });
    });

    describe('expect exports', () => {
        test('exports AssertionError class', () => {
            expect(repterm.AssertionError).toBeTypeOf('function');
        });
    });

    describe('test.step syntax', () => {
        test('test has step method attached', () => {
            expect((repterm.test as unknown as Record<string, unknown>).step).toBeTypeOf('function');
        });

        test('test has describe method attached', () => {
            expect((repterm.test as unknown as Record<string, unknown>).describe).toBeTypeOf('function');
        });
    });
});
