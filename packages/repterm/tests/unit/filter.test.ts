/**
 * Unit tests for src/runner/filter.ts - Test filtering by record mode
 */

import { describe, test, expect } from 'bun:test';
import {
    shouldRunTest,
    filterSuites,
    countTests,
} from '../../src/runner/filter.js';
import type { TestCase, TestSuite } from '../../src/runner/models.js';

function makeCase(name: string, options?: { record?: boolean }): TestCase {
    return {
        id: `test-${name}`,
        name,
        fn: async () => {},
        timeout: 5000,
        fixtures: {},
        steps: [],
        options,
    };
}

function makeSuite(
    id: string,
    name: string,
    tests: TestCase[],
    options?: { record?: boolean },
    suites?: TestSuite[],
    parent?: TestSuite
): TestSuite {
    const suite: TestSuite = {
        id,
        name,
        tests,
        config: {},
        options,
        suites,
        parent,
    };
    if (suites) {
        for (const s of suites) {
            s.parent = suite;
        }
    }
    return suite;
}

describe('shouldRunTest', () => {
    test('recordMode false: runs all tests', () => {
        const suite = makeSuite('s1', 'Suite', [makeCase('a'), makeCase('b', { record: true })]);
        expect(shouldRunTest(suite.tests[0], suite, false)).toBe(true);
        expect(shouldRunTest(suite.tests[1], suite, false)).toBe(true);
    });

    test('recordMode true: runs only tests with record: true', () => {
        const suite = makeSuite('s1', 'Suite', [
            makeCase('no-record'),
            makeCase('with-record', { record: true }),
        ]);
        expect(shouldRunTest(suite.tests[0], suite, true)).toBe(false);
        expect(shouldRunTest(suite.tests[1], suite, true)).toBe(true);
    });

    test('recordMode true: test inherits record from suite', () => {
        const suite = makeSuite('s1', 'Suite', [makeCase('a')], { record: true });
        expect(shouldRunTest(suite.tests[0], suite, true)).toBe(true);
    });

    test('recordMode true: suite record false excludes test', () => {
        const suite = makeSuite('s1', 'Suite', [makeCase('a')], { record: false });
        expect(shouldRunTest(suite.tests[0], suite, true)).toBe(false);
    });

    test('recordMode true: test overrides suite (explicit record: true)', () => {
        const suite = makeSuite('s1', 'Suite', [makeCase('a', { record: true })], { record: false });
        expect(shouldRunTest(suite.tests[0], suite, true)).toBe(true);
    });

    test('recordMode true: test overrides suite (explicit record: false)', () => {
        const suite = makeSuite('s1', 'Suite', [makeCase('a', { record: false })], { record: true });
        expect(shouldRunTest(suite.tests[0], suite, true)).toBe(false);
    });

    test('recordMode true: nested suite inherits parent record', () => {
        const parent = makeSuite('p', 'Parent', []);
        const child = makeSuite('c', 'Child', [makeCase('child-test')], undefined, undefined, parent);
        parent.suites = [child];
        expect(shouldRunTest(child.tests[0], child, true)).toBe(false);

        const parentRecord = makeSuite('p2', 'Parent', [], { record: true });
        const child2 = makeSuite('c2', 'Child', [makeCase('child-test')], undefined, undefined, parentRecord);
        parentRecord.suites = [child2];
        expect(shouldRunTest(child2.tests[0], child2, true)).toBe(true);
    });
});

describe('filterSuites', () => {
    test('recordMode false: returns all suites with all tests', () => {
        const s1 = makeSuite('s1', 'S1', [makeCase('a'), makeCase('b', { record: true })]);
        const s2 = makeSuite('s2', 'S2', [makeCase('c')]);
        const filtered = filterSuites([s1, s2], false);
        expect(filtered).toHaveLength(2);
        expect(filtered[0].tests).toHaveLength(2);
        expect(filtered[1].tests).toHaveLength(1);
    });

    test('recordMode true: removes suites with no record tests', () => {
        const s1 = makeSuite('s1', 'S1', [makeCase('a')]); // no record
        const s2 = makeSuite('s2', 'S2', [makeCase('b', { record: true })]);
        const filtered = filterSuites([s1, s2], true);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe('S2');
        expect(filtered[0].tests).toHaveLength(1);
    });

    test('recordMode true: filters tests within suite', () => {
        const s1 = makeSuite('s1', 'S1', [
            makeCase('a'),
            makeCase('b', { record: true }),
            makeCase('c'),
        ]);
        const filtered = filterSuites([s1], true);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].tests).toHaveLength(1);
        expect(filtered[0].tests[0].name).toBe('b');
    });

    test('recordMode true: nested suites without record tests are removed', () => {
        const child = makeSuite('c', 'Child', [makeCase('x')]);
        const parent = makeSuite('p', 'Parent', [makeCase('y', { record: true })], undefined, [child]);
        const filtered = filterSuites([parent], true);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].tests).toHaveLength(1);
        expect(filtered[0].suites).toHaveLength(0);
    });

    test('recordMode true: keeps nested suite that has record tests', () => {
        const child = makeSuite('c', 'Child', [makeCase('x', { record: true })]);
        const parent = makeSuite('p', 'Parent', [], undefined, [child]);
        const filtered = filterSuites([parent], true);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].suites).toHaveLength(1);
        expect(filtered[0].suites![0].tests).toHaveLength(1);
    });

    test('returns new suite objects (does not mutate)', () => {
        const s1 = makeSuite('s1', 'S1', [makeCase('a')]);
        const filtered = filterSuites([s1], false);
        expect(filtered[0]).not.toBe(s1);
        expect(filtered[0].tests).not.toBe(s1.tests);
    });
});

describe('countTests', () => {
    test('counts top-level tests only', () => {
        const s1 = makeSuite('s1', 'S1', [makeCase('a'), makeCase('b')]);
        const s2 = makeSuite('s2', 'S2', [makeCase('c')]);
        expect(countTests([s1, s2])).toBe(3);
    });

    test('counts nested suite tests', () => {
        const child = makeSuite('c', 'Child', [makeCase('x'), makeCase('y')]);
        const parent = makeSuite('p', 'Parent', [makeCase('z')], undefined, [child]);
        expect(countTests([parent])).toBe(3);
    });

    test('returns 0 for empty suite list', () => {
        expect(countTests([])).toBe(0);
    });

    test('returns 0 for suite with no tests and no children', () => {
        const s = makeSuite('s', 'S', []);
        expect(countTests([s])).toBe(0);
    });
});
