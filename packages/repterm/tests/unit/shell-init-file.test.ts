/**
 * Unit tests for shell init file creation and shell integration script generation
 */

import { describe, test, expect } from 'bun:test';
import { createShellInitFile, getShellIntegrationScript, stripAnsiEnhanced, isShellSupported } from '../../src/terminal/shell-integration.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('getShellIntegrationScript', () => {
  test('generates bash script with PROMPT_COMMAND', () => {
    const script = getShellIntegrationScript('/bin/bash');
    expect(script).toContain('__repterm_prompt_command');
    expect(script).toContain('PROMPT_COMMAND');
    expect(script).toContain('133;A');
    expect(script).toContain('133;C');
    expect(script).toContain('133;D');
    expect(script).toContain('__REPTERM_SHELL_INTEGRATION');
  });

  test('generates zsh script with precmd/preexec', () => {
    const script = getShellIntegrationScript('/bin/zsh');
    expect(script).toContain('__repterm_precmd');
    expect(script).toContain('__repterm_preexec');
    expect(script).toContain('precmd_functions');
    expect(script).toContain('preexec_functions');
    expect(script).toContain('133;A');
    expect(script).toContain('133;C');
    expect(script).toContain('133;D');
    expect(script).toContain('__REPTERM_SHELL_INTEGRATION');
  });

  test('includes anti-duplicate guard', () => {
    const bashScript = getShellIntegrationScript('/bin/bash');
    expect(bashScript).toContain('__REPTERM_SHELL_INTEGRATION');

    const zshScript = getShellIntegrationScript('/usr/bin/zsh');
    expect(zshScript).toContain('__REPTERM_SHELL_INTEGRATION');
  });
});

describe('createShellInitFile', () => {
  test('creates temp rcfile for bash', () => {
    const result = createShellInitFile('/bin/bash');
    try {
      expect(existsSync(result.filePath)).toBe(true);
      const content = readFileSync(result.filePath, 'utf-8');
      expect(content).toContain('source "$HOME/.bashrc"');
      expect(content).toContain('__repterm_prompt_command');
      expect(content).toContain('133;A');
      expect(content).toContain('133;D');
      expect(result.shellArgs).toEqual(['--rcfile', result.filePath]);
      expect(Object.keys(result.env).length).toBe(0);
    } finally {
      result.cleanup();
    }
    expect(existsSync(result.filePath)).toBe(false);
  });

  test('creates ZDOTDIR for zsh', () => {
    const result = createShellInitFile('/bin/zsh');
    try {
      expect(existsSync(result.filePath)).toBe(true);
      expect(existsSync(join(result.filePath, '.zshrc'))).toBe(true);
      expect(result.env.ZDOTDIR).toBe(result.filePath);
      expect(result.shellArgs).toEqual([]);
      const content = readFileSync(join(result.filePath, '.zshrc'), 'utf-8');
      expect(content).toContain('__repterm_precmd');
      expect(content).toContain('133;A');
    } finally {
      result.cleanup();
    }
    expect(existsSync(result.filePath)).toBe(false);
  });

  test('zsh init sources user zshrc', () => {
    const result = createShellInitFile('/usr/bin/zsh');
    try {
      const content = readFileSync(join(result.filePath, '.zshrc'), 'utf-8');
      expect(content).toContain('REPTERM_REAL_ZDOTDIR');
      expect(content).toContain('.zshrc');
    } finally {
      result.cleanup();
    }
  });

  test('cleanup is idempotent', () => {
    const result = createShellInitFile('/bin/bash');
    result.cleanup();
    // Second call should not throw
    result.cleanup();
  });
});

describe('stripAnsiEnhanced', () => {
  test('strips CSI color codes', () => {
    expect(stripAnsiEnhanced('\x1b[31mred\x1b[0m')).toBe('red');
  });

  test('strips OSC sequences', () => {
    expect(stripAnsiEnhanced('\x1b]0;title\x07text')).toBe('text');
  });

  test('strips OSC 133 markers', () => {
    expect(stripAnsiEnhanced('\x1b]133;A\x07prompt$ ')).toBe('prompt$ ');
  });

  test('strips DCS sequences', () => {
    expect(stripAnsiEnhanced('\x1bPsome data\x1b\\text')).toBe('text');
  });

  test('strips character set sequences', () => {
    expect(stripAnsiEnhanced('\x1b(Btext')).toBe('text');
  });

  test('strips CSI with ? prefix', () => {
    expect(stripAnsiEnhanced('\x1b[?25htext')).toBe('text');
  });

  test('preserves plain text', () => {
    expect(stripAnsiEnhanced('hello world')).toBe('hello world');
  });

  test('handles empty string', () => {
    expect(stripAnsiEnhanced('')).toBe('');
  });

  test('strips multiple mixed sequences', () => {
    const input = '\x1b[31m\x1b]133;A\x07red text\x1b[0m\x1b]0;title\x07';
    expect(stripAnsiEnhanced(input)).toBe('red text');
  });

  test('strips OSC sequences with ST terminator', () => {
    expect(stripAnsiEnhanced('\x1b]0;title\x1b\\text')).toBe('text');
  });
});

describe('isShellSupported', () => {
  test('supports bash', () => {
    expect(isShellSupported('/bin/bash')).toBe(true);
    expect(isShellSupported('/usr/bin/bash')).toBe(true);
    expect(isShellSupported('bash')).toBe(true);
  });

  test('supports zsh', () => {
    expect(isShellSupported('/bin/zsh')).toBe(true);
    expect(isShellSupported('/usr/bin/zsh')).toBe(true);
    expect(isShellSupported('zsh')).toBe(true);
  });

  test('rejects fish', () => {
    expect(isShellSupported('/usr/bin/fish')).toBe(false);
  });

  test('rejects dash', () => {
    expect(isShellSupported('/bin/dash')).toBe(false);
  });

  test('rejects ksh', () => {
    expect(isShellSupported('/bin/ksh')).toBe(false);
  });

  test('rejects csh/tcsh', () => {
    expect(isShellSupported('/bin/csh')).toBe(false);
    expect(isShellSupported('/bin/tcsh')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isShellSupported('')).toBe(false);
  });
});

describe('unsupported shell graceful degradation', () => {
  test('getShellIntegrationScript returns empty for fish', () => {
    expect(getShellIntegrationScript('/usr/bin/fish')).toBe('');
  });

  test('getShellIntegrationScript returns empty for dash', () => {
    expect(getShellIntegrationScript('/bin/dash')).toBe('');
  });

  test('createShellInitFile returns empty init for fish', () => {
    const result = createShellInitFile('/usr/bin/fish');
    expect(result.filePath).toBe('');
    expect(result.shellArgs).toEqual([]);
    expect(Object.keys(result.env).length).toBe(0);
    result.cleanup(); // should not throw
  });

  test('createShellInitFile returns empty init for dash', () => {
    const result = createShellInitFile('/bin/dash');
    expect(result.filePath).toBe('');
    expect(result.shellArgs).toEqual([]);
    result.cleanup();
  });
});

describe('shell script compatibility', () => {
  test('zsh precmd is prepended (not appended) to precmd_functions', () => {
    const script = getShellIntegrationScript('/bin/zsh');
    // Should use assignment (prepend) not += (append)
    expect(script).toContain('precmd_functions=(__repterm_precmd');
    expect(script).not.toMatch(/precmd_functions\+=\(__repterm_precmd\)/);
  });

  test('bash DEBUG trap chains with existing trap', () => {
    const script = getShellIntegrationScript('/bin/bash');
    expect(script).toContain('__repterm_old_debug_trap');
    expect(script).toContain('trap -p DEBUG');
    // Should have conditional check before setting trap
    expect(script).toContain('if [[ -n "$__repterm_old_debug_trap" ]]');
    // Should chain with eval in the "has existing trap" branch
    expect(script).toContain('eval "$__repterm_old_debug_trap"');
  });

  test('tmux DCS passthrough helper is included', () => {
    const bashScript = getShellIntegrationScript('/bin/bash');
    expect(bashScript).toContain('$TMUX');
    expect(bashScript).toContain('Ptmux');

    const zshScript = getShellIntegrationScript('/bin/zsh');
    expect(zshScript).toContain('$TMUX');
    expect(zshScript).toContain('Ptmux');
  });
});
