/**
 * Unit tests for OSC133Parser
 */

import { describe, test, expect } from 'bun:test';
import { OSC133Parser } from '../../src/terminal/shell-integration.js';

describe('OSC133Parser', () => {
  test('detects prompt start marker (A)', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;A\x07');
    expect(parser.isActive()).toBe(true);
    const event = parser.getLastEvent('prompt_start');
    expect(event).toBeDefined();
    expect(event!.type).toBe('prompt_start');
  });

  test('detects command start marker (B)', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;B\x07');
    const event = parser.getLastEvent('command_start');
    expect(event).toBeDefined();
  });

  test('detects command executed marker (C)', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;C\x07');
    const event = parser.getLastEvent('command_executed');
    expect(event).toBeDefined();
  });

  test('extracts exit code from D marker', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;D;42\x07');
    const event = parser.getLastEvent('command_finished');
    expect(event).toBeDefined();
    expect(event!.exitCode).toBe(42);
  });

  test('extracts exit code 0', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;D;0\x07');
    const event = parser.getLastEvent('command_finished');
    expect(event).toBeDefined();
    expect(event!.exitCode).toBe(0);
  });

  test('parses full event sequence A→B→C→D→A', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;A\x07');
    parser.feed('user@host:~$ ');
    parser.feed('\x1b]133;B\x07');
    parser.feed('ls -la');
    parser.feed('\x1b]133;C\x07');
    parser.feed('file1.txt\r\nfile2.txt\r\n');
    parser.feed('\x1b]133;D;0\x07');
    parser.feed('\x1b]133;A\x07');

    const events = parser.getEvents();
    expect(events.length).toBe(5);
    expect(events[0].type).toBe('prompt_start');
    expect(events[1].type).toBe('command_start');
    expect(events[2].type).toBe('command_executed');
    expect(events[3].type).toBe('command_finished');
    expect(events[3].exitCode).toBe(0);
    expect(events[4].type).toBe('prompt_start');
  });

  test('handles markers split across data chunks', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133');
    parser.feed(';A\x07');
    expect(parser.isActive()).toBe(true);
  });

  test('ignores non-OSC-133 escape sequences', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b[31mred text\x1b[0m');
    expect(parser.isActive()).toBe(false);
    expect(parser.getEvents().length).toBe(0);
  });

  test('ignores non-133 OSC sequences', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]0;window title\x07');
    expect(parser.isActive()).toBe(false);
    expect(parser.getEvents().length).toBe(0);
  });

  test('countEvents returns correct count', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;D;0\x07');
    parser.feed('\x1b]133;A\x07');
    parser.feed('\x1b]133;D;1\x07');
    expect(parser.countEvents('command_finished')).toBe(2);
    expect(parser.countEvents('prompt_start')).toBe(1);
  });

  test('waitForEvent resolves when event arrives', async () => {
    const parser = new OSC133Parser();
    const promise = parser.waitForEvent('command_finished', 2000);
    setTimeout(() => parser.feed('\x1b]133;D;0\x07'), 50);
    const event = await promise;
    expect(event.exitCode).toBe(0);
  });

  test('waitForEvent rejects on timeout', async () => {
    const parser = new OSC133Parser();
    await expect(parser.waitForEvent('command_finished', 100)).rejects.toThrow(
      'Timeout waiting for command_finished after 100ms'
    );
  });

  test('waitForEvent resolves immediately if event already exists', async () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;A\x07');
    const start = Date.now();
    await parser.waitForEvent('prompt_start', 1000);
    expect(Date.now() - start).toBeLessThan(50);
  });

  test('waitForNthEvent waits for correct count', async () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;D;0\x07'); // 1st

    const promise = parser.waitForNthEvent('command_finished', 2, 2000);
    setTimeout(() => parser.feed('\x1b]133;D;1\x07'), 50); // 2nd
    const event = await promise;
    expect(event.exitCode).toBe(1);
  });

  test('waitForNthEvent resolves immediately if already have enough events', async () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;D;0\x07');
    parser.feed('\x1b]133;D;1\x07');
    const event = await parser.waitForNthEvent('command_finished', 1, 1000);
    expect(event.exitCode).toBe(0);
  });

  test('reset clears all state', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;A\x07');
    expect(parser.isActive()).toBe(true);
    parser.reset();
    expect(parser.isActive()).toBe(false);
    expect(parser.getEvents().length).toBe(0);
  });

  test('handles mixed content with OSC 133 markers', () => {
    const parser = new OSC133Parser();
    const data = 'some text\x1b[31mred\x1b[0m\x1b]133;A\x07prompt$ \x1b]133;B\x07';
    parser.feed(data);
    expect(parser.isActive()).toBe(true);
    expect(parser.getEvents().length).toBe(2);
  });

  // ESC\ (ST) terminator support tests
  test('detects prompt start marker with ST terminator', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;A\x1b\\');
    expect(parser.isActive()).toBe(true);
    const event = parser.getLastEvent('prompt_start');
    expect(event).toBeDefined();
  });

  test('extracts exit code from D marker with ST terminator', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;D;42\x1b\\');
    const event = parser.getLastEvent('command_finished');
    expect(event).toBeDefined();
    expect(event!.exitCode).toBe(42);
  });

  test('handles full sequence with mixed BEL and ST terminators', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;A\x1b\\');      // ST
    parser.feed('prompt$ ');
    parser.feed('\x1b]133;B\x07');         // BEL
    parser.feed('ls');
    parser.feed('\x1b]133;C\x1b\\');       // ST
    parser.feed('file.txt\r\n');
    parser.feed('\x1b]133;D;0\x07');       // BEL

    const events = parser.getEvents();
    expect(events.length).toBe(4);
    expect(events[0].type).toBe('prompt_start');
    expect(events[1].type).toBe('command_start');
    expect(events[2].type).toBe('command_executed');
    expect(events[3].type).toBe('command_finished');
    expect(events[3].exitCode).toBe(0);
  });

  test('D marker with ST and exit code 0', () => {
    const parser = new OSC133Parser();
    parser.feed('\x1b]133;D;0\x1b\\');
    const event = parser.getLastEvent('command_finished');
    expect(event).toBeDefined();
    expect(event!.exitCode).toBe(0);
  });
});
