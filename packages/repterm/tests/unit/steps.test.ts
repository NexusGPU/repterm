/**
 * Unit tests for src/api/steps.ts - Step execution
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { step, clearSteps, getCurrentStepOptions, getCurrentStepName, type StepRecordingOptions } from '../../src/api/steps.js';

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

        test('runs multiple steps without throwing', async () => {
            await step('step 1', async () => { });
            await step('step 2', async () => { });
        });

        test('propagates errors from step function', async () => {
            await expect(
                step('failing step', async () => {
                    throw new Error('Step failed');
                })
            ).rejects.toThrow('Step failed');
        });
    });

    describe('step() with options', () => {
        test('accepts recording options as second argument', async () => {
            const result = await step('my step', { typingSpeed: 100, pauseAfter: 1000 }, async () => {
                return 42;
            });

            expect(result).toBe(42);
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
