import { describe, test, expect } from 'bun:test';
import { calculateOutputRange } from '../../src/terminal/terminal.js';

describe('calculateOutputRange', () => {
  test('simple command without scrolling', () => {
    // cursor 在第 1 行，无 scrollback 增长，输出到第 5 行
    const result = calculateOutputRange(1, 0, 5, 0, 1);
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(4);
  });

  test('multiline heredoc causing scrolling (original bug scenario)', () => {
    // 原始失败场景的真实数据：
    // before: cursorY=17, historySize=1
    // after:  cursorY=22, historySize=32
    const result = calculateOutputRange(17, 1, 22, 32, 1);
    expect(result.startLine).toBe(-13); // 17 + 1 - 31 = -13（scrollback）
    expect(result.endLine).toBe(21);    // 22 - 1
  });

  test('negative startLine is valid (tmux scrollback)', () => {
    // 大量输出导致 historyGrowth 很大
    const result = calculateOutputRange(5, 0, 10, 50, 1);
    expect(result.startLine).toBe(-44); // 5 + 1 - 50
    expect(result.endLine).toBe(9);
  });

  test('no output (cursor unchanged)', () => {
    // 空输出命令（如 true 或 :）
    const result = calculateOutputRange(5, 0, 6, 0, 1);
    expect(result.startLine).toBe(6);
    expect(result.endLine).toBe(5);
    // startLine > endLine → 空范围
  });

  test('single line output', () => {
    const result = calculateOutputRange(3, 0, 5, 0, 1);
    expect(result.startLine).toBe(4);
    expect(result.endLine).toBe(4);
  });

  test('multi-line prompt', () => {
    // promptLineCount = 2 的场景
    const result = calculateOutputRange(3, 0, 8, 0, 2);
    expect(result.startLine).toBe(4);
    expect(result.endLine).toBe(6); // 8 - 2
  });
});
