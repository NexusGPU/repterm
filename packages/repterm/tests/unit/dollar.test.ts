/**
 * Unit tests for src/terminal/dollar.ts - $ tagged template literal
 */

import { describe, test, expect } from 'bun:test';
import { shellEscape, processTemplate, raw } from '../../src/terminal/dollar.js';

/** Helper to create a TemplateStringsArray from plain strings */
function tsa(strings: string[]): TemplateStringsArray {
  return Object.assign([...strings], { raw: [...strings] });
}

describe('shellEscape', () => {
  test('string is single-quoted', () => {
    expect(shellEscape('hello')).toBe("'hello'");
  });

  test('string with single quotes uses POSIX escaping', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  test('number is unquoted', () => {
    expect(shellEscape(42)).toBe('42');
  });

  test('boolean is unquoted', () => {
    expect(shellEscape(true)).toBe('true');
  });

  test('null returns empty string', () => {
    expect(shellEscape(null)).toBe('');
  });

  test('undefined returns empty string', () => {
    expect(shellEscape(undefined)).toBe('');
  });

  test('array elements are escaped and joined with spaces', () => {
    expect(shellEscape(['a', 'b'])).toBe("'a' 'b'");
  });

  test('raw value is passed through unescaped', () => {
    expect(shellEscape(raw('hello world'))).toBe('hello world');
  });

  test('empty string produces empty single quotes', () => {
    expect(shellEscape('')).toBe("''");
  });
});

describe('processTemplate', () => {
  test('basic interpolation', () => {
    expect(processTemplate(tsa(['echo ', '']), ['hello'])).toBe("echo 'hello'");
  });

  test('multiline template preserves newlines', () => {
    const template = tsa(['echo\n  ', '\n  done']);
    expect(processTemplate(template, ['hello'])).toBe("echo\n  'hello'\n  done");
  });

  test('no values passes through unchanged', () => {
    expect(processTemplate(tsa(['echo hello']), [])).toBe('echo hello');
  });
});
