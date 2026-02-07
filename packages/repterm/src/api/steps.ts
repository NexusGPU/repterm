/**
 * test.step with step reporting
 * Provides named steps within tests for better organization
 */

import type { Step } from '../runner/models.js';
import { randomBytes } from 'crypto';

/**
 * Step 录制选项
 */
export interface StepRecordingOptions {
  /** 步骤内命令的打字速度 (ms/字符) */
  typingSpeed?: number;

  /** 步骤结束后暂停时间 (ms) */
  pauseAfter?: number;

  /** 步骤开始前暂停时间 (ms) */
  pauseBefore?: number;

  /** 在录制中显示步骤标题作为注释 */
  showStepTitle?: boolean;
}

/**
 * Current step context (for tracking nested steps)
 */
let currentSteps: Step[] = [];

/**
 * 当前 step 配置上下文
 */
let currentStepOptions: StepRecordingOptions | null = null;

/**
 * 当前 step 名称
 */
let currentStepName: string | null = null;

/**
 * 当前 step 标题是否已显示
 */
let stepTitleShown: boolean = false;

/**
 * 获取当前 step 的录制选项
 */
export function getCurrentStepOptions(): StepRecordingOptions | null {
  return currentStepOptions;
}

/**
 * 获取当前 step 的名称
 */
export function getCurrentStepName(): string | null {
  return currentStepName;
}

/**
 * 检查是否应该显示步骤标题（只显示一次）
 */
export function shouldShowStepTitle(): boolean {
  if (stepTitleShown) return false;
  return currentStepOptions?.showStepTitle ?? false;
}

/**
 * 标记步骤标题已显示
 */
export function markStepTitleShown(): void {
  stepTitleShown = true;
}

/**
 * Execute a named step within a test
 * 支持两种调用方式：
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

  // 保存之前的配置
  const previousOptions = currentStepOptions;
  const previousName = currentStepName;

  // 设置当前 step 配置
  currentStepOptions = options;
  currentStepName = name;
  stepTitleShown = false;  // 重置标题显示状态

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
    // 恢复之前的配置
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

