/**
 * test.step with step reporting
 * Provides named steps within tests for better organization
 */

import type { Step } from '../runner/models.js';
import { randomBytes } from 'crypto';

/**
 * Step recording options
 */
export interface StepRecordingOptions {
  /** Typing speed within step (ms/character) */
  typingSpeed?: number;

  /** Pause duration after step (ms) */
  pauseAfter?: number;

  /** Pause duration before step (ms) */
  pauseBefore?: number;

  /** Display step title as comment in recording */
  showStepTitle?: boolean;
}

/**
 * Current step context (for tracking nested steps)
 */
let currentSteps: Step[] = [];

/**
 * Current step configuration context
 */
let currentStepOptions: StepRecordingOptions | null = null;

/**
 * Current step name
 */
let currentStepName: string | null = null;

/**
 * Whether current step title has been shown
 */
let stepTitleShown: boolean = false;

/**
 * Get recording options for current step
 */
export function getCurrentStepOptions(): StepRecordingOptions | null {
  return currentStepOptions;
}

/**
 * Get current step name
 */
export function getCurrentStepName(): string | null {
  return currentStepName;
}

/**
 * Check if step title should be displayed (only once)
 */
export function shouldShowStepTitle(): boolean {
  if (stepTitleShown) return false;
  return currentStepOptions?.showStepTitle ?? false;
}

/**
 * Mark step title as shown
 */
export function markStepTitleShown(): void {
  stepTitleShown = true;
}

/**
 * Execute a named step within a test
 * Supports two calling conventions:
 * - step(name, fn)
 * - step(name, options, fn)
 */
export async function step<T>(
  name: string,
  optionsOrFn: StepRecordingOptions | (() => Promise<T>),
  maybeFn?: () => Promise<T>
): Promise<T> {
  const options = typeof optionsOrFn === 'function' ? {} : optionsOrFn;
  const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn!;

  const stepObj: Step = {
    id: generateId(),
    type: 'step',
    name,
    payload: null,
  };

  // Add to current steps
  currentSteps.push(stepObj);

  // Save previous configuration
  const previousOptions = currentStepOptions;
  const previousName = currentStepName;

  // Set current step configuration
  currentStepOptions = options;
  currentStepName = name;
  stepTitleShown = false;  // Reset title shown status

  try {
    // Execute the step function
    const result = await fn();
    return result;
  } catch (error) {
    // Attach error info to step
    stepObj.payload = {
      error: (error as Error).message,
      stack: (error as Error).stack,
    };
    throw error;
  } finally {
    // Restore previous configuration
    currentStepOptions = previousOptions;
    currentStepName = previousName;
  }
}

/**
 * Clear steps (called after each test)
 */
export function clearSteps(): void {
  currentSteps = [];
  currentStepOptions = null;
  currentStepName = null;
  stepTitleShown = false;
}

/**
 * Generate a unique step ID
 */
function generateId(): string {
  return randomBytes(8).toString('hex');
}

