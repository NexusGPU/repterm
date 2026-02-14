/**
 * Tagged template literal ($) support for shell command execution
 *
 * Provides a zx/Bun Shell-like `$` syntax for running commands with
 * automatic shell escaping of interpolated values.
 *
 * Usage:
 *   await $`echo ${name}`           // auto-escapes name
 *   await $({ timeout: 5000 })`ls`  // with options
 *   await terminal.$`echo hello`    // via terminal instance
 */

import type { RunOptions, PTYProcess } from '../runner/models.js';

/**
 * Marker for values that should not be shell-escaped.
 * Use raw() to embed pre-constructed command strings.
 */
export interface RawValue {
  readonly __raw: true;
  readonly value: string;
}

/**
 * Mark a string value to skip shell escaping when interpolated in $`...`.
 * Use for pre-constructed command strings that are already safe.
 *
 * @example
 * const cmd = buildCommand('get pods');
 * await $`${raw(cmd)}`;  // embeds cmd as-is, no quoting
 */
export function raw(value: string): RawValue {
  return { __raw: true, value };
}

/**
 * Shell-escape a value for safe interpolation into a command string.
 * - RawValue: embedded as-is (no escaping)
 * - null/undefined: empty string
 * - number/boolean: string representation (no quoting needed)
 * - array: each element escaped and joined with spaces
 * - string: wrapped in single quotes with internal quotes escaped (POSIX-safe)
 */
export function shellEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null && '__raw' in value) {
    return (value as RawValue).value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(shellEscape).join(' ');
  const str = String(value);
  // POSIX single-quote escaping: replace ' with '\'' (end quote, escaped quote, start quote)
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Process a tagged template literal into a command string with safe interpolation.
 * Preserves newlines to support heredocs and multiline scripts.
 */
export function processTemplate(strings: TemplateStringsArray, values: unknown[]): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += shellEscape(values[i]);
    }
  }
  return result.trim();
}

/**
 * A function that can be used as both a tagged template literal and an options factory.
 *
 * @example
 * // As tagged template:
 * await $`echo hello`
 *
 * // As options factory:
 * await $({ timeout: 5000 })`echo hello`
 *
 * // With interpolation:
 * await $`echo ${name}`
 */
export interface DollarFunction {
  /** Tagged template literal usage: $`command ${arg}` */
  (strings: TemplateStringsArray, ...values: unknown[]): PTYProcess;
  /** Options factory usage: $({ timeout: 5000 })`command` */
  (options: RunOptions): (strings: TemplateStringsArray, ...values: unknown[]) => PTYProcess;
}

/**
 * Create a DollarFunction bound to a specific run implementation.
 *
 * @param run - The underlying command execution function
 * @returns A DollarFunction that can be used as tagged template or options factory
 */
export function createDollarFunction(run: (cmd: string, opts?: RunOptions) => PTYProcess): DollarFunction {
  return function dollarFn(
    stringsOrOptions: TemplateStringsArray | RunOptions,
    ...values: unknown[]
  ): any {
    // Distinguish tagged template (has 'raw' property) from options object
    if (Array.isArray(stringsOrOptions) && 'raw' in stringsOrOptions) {
      const command = processTemplate(stringsOrOptions as TemplateStringsArray, values);
      return run(command);
    }
    // Options factory: return a new tagged template function with options bound
    const options = stringsOrOptions as RunOptions;
    return (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const command = processTemplate(strings, vals);
      return run(command, options);
    };
  } as DollarFunction;
}
