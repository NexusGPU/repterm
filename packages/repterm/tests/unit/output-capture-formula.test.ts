import { describe, test, expect } from 'bun:test';
import { calculateOutputRange } from '../../src/terminal/terminal.js';

describe('calculateOutputRange', () => {
  test('simple command without scrolling', () => {
    // cursor on line 1, no scrollback growth, output to line 5
    const result = calculateOutputRange(1, 0, 5, 0, 1);
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(4);
  });

  test('multiline heredoc causing scrolling (original bug scenario)', () => {
    // Real data from original failure:
    // before: cursorY=17, historySize=1
    // after:  cursorY=22, historySize=32
    const result = calculateOutputRange(17, 1, 22, 32, 1);
    expect(result.startLine).toBe(-13); // 17 + 1 - 31 = -13（scrollback）
    expect(result.endLine).toBe(21);    // 22 - 1
  });

  test('negative startLine is valid (tmux scrollback)', () => {
    // Large output causes big historyGrowth
    const result = calculateOutputRange(5, 0, 10, 50, 1);
    expect(result.startLine).toBe(-44); // 5 + 1 - 50
    expect(result.endLine).toBe(9);
  });

  test('no output (cursor unchanged)', () => {
    // No-output command (e.g. true or :)
    const result = calculateOutputRange(5, 0, 6, 0, 1);
    expect(result.startLine).toBe(6);
    expect(result.endLine).toBe(5);
    // startLine > endLine -> empty range
  });

  test('single line output', () => {
    const result = calculateOutputRange(3, 0, 5, 0, 1);
    expect(result.startLine).toBe(4);
    expect(result.endLine).toBe(4);
  });

  test('multi-line prompt', () => {
    // promptLineCount = 2 scenario
    const result = calculateOutputRange(3, 0, 8, 0, 2);
    expect(result.startLine).toBe(4);
    expect(result.endLine).toBe(6); // 8 - 2
  });
});
