/**
 * Example 19: Advanced $ tagged template literal
 *
 * Run: bun run repterm examples/19-dollar-advanced.ts
 *
 * Demonstrates advanced usage of the $ tagged template literal:
 * - raw() for pre-constructed command strings (skip escaping)
 * - Type-based escaping behavior (string, number, boolean, array, null)
 * - Special character handling and quoting
 * - Multi-terminal $ usage
 * - Dynamic command construction patterns
 */

import { test, expect, describe, raw } from 'repterm';

describe('raw() — skip escaping', () => {
  test('raw() embeds value without quoting', async ({ $ }) => {
    // Without raw(): the variable would be single-quoted
    // With raw(): embedded as-is, allowing shell interpretation
    const cmd = 'echo "hello from raw"';
    const result = await $`${raw(cmd)}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('hello from raw');
    console.log(`  raw command executed: ${result.command}`);
  });

  test('raw() for shell scripts with special syntax', async ({ $ }) => {
    // Complex shell one-liners must use raw() to avoid quoting
    const script = `bash -c 'for i in 1 2 3; do echo "num:$i"; done'`;
    const result = await $`${raw(script)}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('num:1');
    expect(result).toContainInOutput('num:3');
  });

  test('raw() for pipe chains', async ({ $ }) => {
    const pipeline = 'echo -e "b\\na\\nc" | sort';
    const result = await $`${raw(pipeline)}`;
    expect(result).toSucceed();
    expect(result).toHaveStdout('a');
  });

  test('mix raw() and escaped values', async ({ $ }) => {
    const name = "world";
    const prefix = 'echo';
    // prefix is raw (no quoting), name is escaped (single-quoted)
    const result = await $`${raw(prefix)} hello ${name}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('hello world');
  });
});

describe('Type-based escaping behavior', () => {
  test('strings are single-quoted', async ({ $ }) => {
    const value = "hello world";
    // Becomes: echo 'hello world'
    const result = await $`echo ${value}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('hello world');
  });

  test('strings with single quotes use POSIX escaping', async ({ $ }) => {
    const value = "it's a test";
    // Becomes: echo 'it'\''s a test' (POSIX-safe escaping)
    const result = await $`echo ${value}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput("it's a test");
  });

  test('numbers are unquoted', async ({ $ }) => {
    const port = 8080;
    const count = 3;
    // Becomes: echo 8080 3 (no quotes needed for numbers)
    const result = await $`echo ${port} ${count}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('8080 3');
  });

  test('booleans are unquoted', async ({ $ }) => {
    const flag = true;
    // Becomes: echo true
    const result = await $`echo ${flag}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('true');
  });

  test('arrays are space-separated with each element escaped', async ({ $ }) => {
    const files = ['file one.txt', 'file two.txt', 'file three.txt'];
    // Becomes: echo 'file one.txt' 'file two.txt' 'file three.txt'
    const result = await $`echo ${files}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('file one.txt');
    expect(result).toContainInOutput('file three.txt');
  });

  test('null and undefined become empty strings', async ({ $ }) => {
    const empty = null;
    // Becomes: echo  (empty interpolation)
    const result = await $`echo "prefix${empty}suffix"`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('prefixsuffix');
  });
});

describe('Special character safety', () => {
  test('shell metacharacters are safely escaped', async ({ $ }) => {
    const dangerous = '$(whoami) && rm -rf /';
    // Becomes: echo '$(whoami) && rm -rf /' — shell doesn't interpret
    const result = await $`echo ${dangerous}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('$(whoami)');
    console.log(`  safely escaped: ${result.stdout.trim()}`);
  });

  test('backticks and semicolons are neutralized', async ({ $ }) => {
    // Without escaping: `evil` would trigger command substitution
    // and "; echo hacked" would run as a second command.
    // With shellEscape: the entire string is a single safe argument.
    const input = '`evil`; echo hacked';
    const result = await $`echo ${input}`;
    expect(result).toSucceed();
    // The entire input is echoed as one literal string (not executed)
    expect(result).toContainInOutput('`evil`; echo hacked');
    console.log(`  safely echoed: ${result.stdout.trim()}`);
  });

  test('newlines in values are preserved within quotes', async ({ $ }) => {
    const multiline = 'line1\nline2';
    const result = await $`echo ${multiline}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('line1');
  });
});

describe('Multi-terminal $ usage', () => {
  test('each terminal has its own $ method', async ({ $, terminal }) => {
    // $ from context is bound to the default terminal
    const r1 = await $`echo "from default"`;
    expect(r1).toSucceed();

    // Create a second terminal and use its own $
    const terminal2 = await terminal.create();
    const r2 = await terminal2.$`echo "from terminal2"`;
    expect(r2).toSucceed();
    expect(r2).toContainInOutput('from terminal2');

    console.log(`  default: ${r1.stdout.trim()}, terminal2: ${r2.stdout.trim()}`);
    await terminal2.close();
  });
});

describe('Dynamic command patterns', () => {
  test('build commands with variable parts', async ({ $ }) => {
    const file = '/tmp/repterm-test-19.txt';
    await $`echo "hello" > ${file}`;
    const result = await $`cat ${file}`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('hello');
    await $`rm -f ${file}`;
  });

  test('conditional command construction with raw()', async ({ $ }) => {
    const verbose = true;
    const flags = verbose ? '-la' : '-l';
    const result = await $`ls ${raw(flags)} /tmp`;
    expect(result).toSucceed();
    console.log(`  ls ${flags} returned ${result.stdout.split('\n').length} lines`);
  });

  test('loop over commands', async ({ $ }) => {
    const names = ['alpha', 'beta', 'gamma'];
    for (const name of names) {
      const result = await $`echo ${name}`;
      expect(result).toSucceed();
      expect(result).toContainInOutput(name);
    }
    console.log(`  executed ${names.length} commands`);
  });
});
