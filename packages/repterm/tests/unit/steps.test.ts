/**
 * Unit tests for src/api/steps.ts - Step execution
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { step, getSteps, clearSteps } from '../../src/api/steps.js';

describe('steps', () => {
    beforeEach(() => {
        clearSteps();
    });

    describe('step()', () => {
        test('executes the step function and returns result', async () => {
            const result = await step('my step', async () => {
                return 42;
            });

            expect(result).toBe(42);
        });

        test('records the step in the steps list', async () => {
            await step('step 1', async () => { });
            await step('step 2', async () => { });

            const steps = getSteps();
            expect(steps).toHaveLength(2);
            expect(steps[0].name).toBe('step 1');
            expect(steps[1].name).toBe('step 2');
        });

        test('generates unique IDs for each step', async () => {
            await step('step 1', async () => { });
            await step('step 2', async () => { });

            const steps = getSteps();
            expect(steps[0].id).not.toBe(steps[1].id);
        });

        test('sets step type to "step"', async () => {
            await step('my step', async () => { });

            const steps = getSteps();
            expect(steps[0].type).toBe('step');
        });

        test('propagates errors from step function', async () => {
            await expect(
                step('failing step', async () => {
                    throw new Error('Step failed');
                })
            ).rejects.toThrow('Step failed');
        });

        test('records error info on step when it fails', async () => {
            try {
                await step('failing step', async () => {
                    throw new Error('Step failed');
                });
            } catch {
                // Expected
            }

            const steps = getSteps();
            expect(steps[0].payload).toBeDefined();
            expect((steps[0].payload as { error: string }).error).toBe('Step failed');
        });
    });

    describe('getSteps()', () => {
        test('returns a copy of steps array', async () => {
            await step('step 1', async () => { });

            const steps1 = getSteps();
            const steps2 = getSteps();

            expect(steps1).toEqual(steps2);
            expect(steps1).not.toBe(steps2);
        });

        test('returns empty array when no steps', () => {
            const steps = getSteps();
            expect(steps).toEqual([]);
        });
    });

    describe('clearSteps()', () => {
        test('clears all recorded steps', async () => {
            await step('step 1', async () => { });
            await step('step 2', async () => { });

            clearSteps();

            const steps = getSteps();
            expect(steps).toHaveLength(0);
        });
    });
});
