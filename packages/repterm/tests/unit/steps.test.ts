/**
 * Unit tests for src/api/steps.ts - Step execution
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { step, getSteps, clearSteps, getCurrentStepOptions, getCurrentStepName, type StepRecordingOptions } from '../../src/api/steps.js';

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

    describe('step() with options', () => {
        test('accepts recording options as second argument', async () => {
            const result = await step('my step', { typingSpeed: 100, pauseAfter: 1000 }, async () => {
                return 42;
            });

            expect(result).toBe(42);
            const steps = getSteps();
            expect(steps[0].name).toBe('my step');
        });

        test('getCurrentStepOptions returns current options during step', async () => {
            let capturedOptions: StepRecordingOptions | null = null;

            await step('test step', { typingSpeed: 120 }, async () => {
                capturedOptions = getCurrentStepOptions();
            });

            expect(capturedOptions?.typingSpeed).toBe(120);
        });

        test('options are restored after step completes', async () => {
            let innerOptions: StepRecordingOptions | null = null;
            let outerOptionsAfter: StepRecordingOptions | null = null;

            await step('outer', { typingSpeed: 100 }, async () => {
                await step('inner', { typingSpeed: 200 }, async () => {
                    innerOptions = getCurrentStepOptions();
                });
                outerOptionsAfter = getCurrentStepOptions();
            });

            expect(innerOptions?.typingSpeed).toBe(200);
            expect(outerOptionsAfter?.typingSpeed).toBe(100);
            expect(getCurrentStepOptions()).toBeNull();
        });

        test('getCurrentStepName returns current step name', async () => {
            let capturedName: string | null = null;

            await step('my named step', { showStepTitle: true }, async () => {
                capturedName = getCurrentStepName();
            });

            expect(capturedName).toBe('my named step');
            expect(getCurrentStepName()).toBeNull();
        });
    });
});
