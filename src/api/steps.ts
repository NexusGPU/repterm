/**
 * test.step with step reporting
 * Provides named steps within tests for better organization
 */

import type { Step } from '../runner/models.js';
import { randomBytes } from 'crypto';

/**
 * Current step context (for tracking nested steps)
 */
let currentSteps: Step[] = [];

/**
 * Execute a named step within a test
 */
export async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const stepObj: Step = {
    id: generateId(),
    type: 'step',
    name,
    payload: null,
  };

  // Add to current steps
  currentSteps.push(stepObj);

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
  }
}

/**
 * Get all steps recorded for the current test
 */
export function getSteps(): Step[] {
  return [...currentSteps];
}

/**
 * Clear steps (called after each test)
 */
export function clearSteps(): void {
  currentSteps = [];
}

/**
 * Generate a unique step ID
 */
function generateId(): string {
  return randomBytes(8).toString('hex');
}
