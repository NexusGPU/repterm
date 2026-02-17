/**
 * Example 15: Comprehensive stress test — recording mode showcase
 *
 * Run: bun run repterm examples/15-comprehensive-stress-test.ts
 *
 * Each describe block contains one consolidated test that demonstrates
 * a complete workflow in recording mode with no typing delay.
 */

import { test, expect, describe, step, raw } from 'repterm';

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Interactive workflows
// ─────────────────────────────────────────────────────────────────────────────

describe('Interactive workflows', { record: true }, () => {
  test('conditional, accumulation, hidden input, menu, CSV parsing', async ({ $ }) => {
    await step('interactive workflows', { typingSpeed: 0 }, async () => {
      // 1. Conditional branching
      const condScript = `bash -c '
        read -p "Enter a number: " n
        if [ "$n" -gt 50 ]; then
          echo "HIGH: $n"
          read -p "Continue? " ans
          echo "You said: $ans"
          exit 0
        else
          echo "LOW: $n"
          exit 1
        fi
      '`;
      const cond = $({ interactive: true })`${raw(condScript)}`;
      await cond.expect('Enter a number:');
      await cond.send('99');
      await cond.expect('HIGH: 99');
      await cond.expect('Continue?');
      await cond.send('yes');
      await cond.expect('You said: yes');
      expect(await cond).toSucceed();
      console.log('  conditional branching → passed');

      // 2. Accumulation loop
      const accScript = `bash -c '
        total=0
        for i in 1 2 3 4; do
          read -p "Value $i: " v
          total=$((total + v))
          echo "Running total: $total"
        done
        echo "Final sum: $total"
      '`;
      const acc = $({ interactive: true })`${raw(accScript)}`;
      const values = [10, 20, 30, 40];
      let expectedTotal = 0;
      for (let i = 0; i < 4; i++) {
        await acc.expect(`Value ${i + 1}:`);
        await acc.send(String(values[i]));
        expectedTotal += values[i];
        await acc.expect(`Running total: ${expectedTotal}`);
      }
      await acc.expect('Final sum: 100');
      expect(await acc).toSucceed();
      console.log('  4-round accumulation → sum=100');

      // 3. Hidden input (password-style)
      const pwScript = `bash -c 'read -sp "Secret: " pw; echo; echo "Length: \${#pw}"'`;
      const pw = $({ interactive: true })`${raw(pwScript)}`;
      await pw.expect('Secret:');
      await pw.sendRaw('mypassword\r');
      await pw.expect('Length: 10');
      expect(await pw).toSucceed();
      console.log('  hidden input → length=10');

      // 4. Menu-driven program
      const menuScript = `bash -c '
        while true; do
          echo "--- MENU ---"
          echo "1) Greet  2) Count  3) Quit"
          read -p "Choice: " c
          case "$c" in
            1) read -p "Name: " name; echo "Hello, $name!" ;;
            2) for i in 1 2 3; do echo "Count: $i"; done ;;
            3) echo "Goodbye!"; exit 0 ;;
            *) echo "Invalid" ;;
          esac
        done
      '`;
      const menu = $({ interactive: true })`${raw(menuScript)}`;
      await menu.expect('Choice:');
      await menu.send('1');
      await menu.expect('Name:');
      await menu.send('World');
      await menu.expect('Hello, World!');
      await menu.expect('Choice:');
      await menu.send('2');
      await menu.expect('Count: 3');
      await menu.expect('Choice:');
      await menu.send('9');
      await menu.expect('Invalid');
      await menu.expect('Choice:');
      await menu.send('3');
      await menu.expect('Goodbye!');
      expect(await menu).toSucceed();
      console.log('  menu → 4 rounds');

      // 5. CSV parsing
      const csvScript = `bash -c 'read -p "CSV: " line; echo "$line" | tr "," "\\n" | while read f; do echo "Field: $f"; done'`;
      const csv = $({ interactive: true })`${raw(csvScript)}`;
      await csv.expect('CSV:');
      await csv.send('x,y,z');
      await csv.expect('Field: x');
      await csv.expect('Field: z');
      expect(await csv).toSucceed();
      console.log('  CSV parsing → fields extracted');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Shell constructs
// ─────────────────────────────────────────────────────────────────────────────

describe('Shell constructs', { record: true }, () => {
  test('subshells, pipelines, heredocs, arrays, conditionals, loops', async ({ $ }) => {
    await step('shell constructs', { typingSpeed: 0 }, async () => {
      // Nested subshells
      const sub = await $`(echo outer; (echo inner; (exit 7)))`;
      expect(sub).toHaveExitCode(7);
      expect(sub).toContainInOutput('outer');
      expect(sub).toContainInOutput('inner');
      console.log(`  nested subshell → code=${sub.code}`);

      // Pipeline chain
      const pipe = await $`printf "apple\\nbanana\\napricot\\navocado\\nblueberry\\n" | grep "^a" | wc -l`;
      expect(pipe).toSucceed();
      expect(pipe).toContainInOutput('3');
      console.log('  pipeline grep+wc → 3 matches');

      // Process substitution (bash -c required for <(...) quoting)
      const diff = await $`bash -c 'diff <(printf "a\\nb\\nc\\n") <(printf "a\\nb\\nc\\n"); echo "SAME:$?"'`;
      expect(diff).toSucceed();
      expect(diff).toContainInOutput('SAME:0');

      // Variable expansion
      const varExp = await $`NAME=World; echo "Hello $NAME"; echo "Line 2"`;
      expect(varExp).toSucceed();
      expect(varExp).toContainInOutput('Hello World');
      expect(varExp).toContainInOutput('Line 2');

      // Heredoc
      const heredoc = await $`cat << 'EOF'\nHello World\nLine 2\nEOF`;
      expect(heredoc).toSucceed();
      expect(heredoc).toContainInOutput('Hello World');
      expect(heredoc).toContainInOutput('Line 2');

      // Heredoc with variable expansion
      const heredocVar = await $`NAME=Test; cat << EOF\nHello $NAME\nEOF`;
      expect(heredocVar).toSucceed();
      expect(heredocVar).toContainInOutput('Hello Test');
      console.log('  heredoc → output captured');

      // Arithmetic and bitwise
      const arith = await $`echo "$((2**10)) $((255 & 0xF0)) $((7 << 3))"`;
      expect(arith).toSucceed();
      expect(arith).toContainInOutput('1024');
      expect(arith).toContainInOutput('240');
      expect(arith).toContainInOutput('56');
      console.log('  arithmetic → 1024, 240, 56');

      // Bash array and string manipulation (bash -c required for arr=() and ${str^^})
      const arr = await $`bash -c 'arr=(alpha beta gamma delta); echo "len=\${#arr[@]} first=\${arr[0]} last=\${arr[-1]}"; str="Hello World"; echo "upper=\${str^^} len=\${#str}"'`;
      expect(arr).toSucceed();
      expect(arr).toContainInOutput('len=4');
      expect(arr).toContainInOutput('first=alpha');
      expect(arr).toContainInOutput('last=delta');
      expect(arr).toContainInOutput('upper=HELLO WORLD');

      // Conditional chains
      const chain1 = await $`true && echo "A" && false || echo "B"`;
      expect(chain1).toSucceed();
      expect(chain1).toContainInOutput('A');
      expect(chain1).toContainInOutput('B');
      const chain2 = await $`false && echo "SKIP" || echo "FALLBACK"`;
      expect(chain2).toSucceed();
      expect(chain2).toContainInOutput('FALLBACK');
      expect(chain2).not.toContainInOutput('SKIP');
      console.log('  conditional chains → correct');

      // Command substitution nesting
      const nest = await $`echo "result: $(echo "inner: $(echo deep)")"`;
      expect(nest).toSucceed();
      expect(nest).toContainInOutput('deep');

      // While loop
      const loop = await $`i=0; while [ $i -lt 5 ]; do echo "iter:$i"; i=$((i+1)); done; echo "done:$i"`;
      expect(loop).toSucceed();
      expect(loop).toContainInOutput('iter:0');
      expect(loop).toContainInOutput('iter:4');
      expect(loop).toContainInOutput('done:5');

      // Background jobs
      const bg = await $`echo "JOB1" & echo "JOB2" & echo "JOB3"; wait`;
      expect(bg).toSucceed();
      const bgOut = bg.stdout || '';
      expect(bgOut.includes('JOB1') || bgOut.includes('JOB2') || bgOut.includes('JOB3')).toBe(true);
      console.log('  background jobs → output captured');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Output handling
// ─────────────────────────────────────────────────────────────────────────────

describe('Output handling', { record: true }, () => {
  test('volume, interleaving, ANSI, special chars, stderr', async ({ $ }) => {
    await step('output handling', { typingSpeed: 0 }, async () => {
      // Large volume (500 lines)
      const vol = await $`seq 1 500`;
      expect(vol).toSucceed();
      expect(vol).toContainInOutput('1');
      expect(vol).toContainInOutput('250');
      expect(vol).toContainInOutput('500');
      console.log('  500-line output captured');

      // Interleaved stdout/stderr (PTY merges streams, use toContainInOutput)
      const mix = await $`for i in 1 2 3 4 5; do echo "OUT:$i"; echo "ERR:$i" >&2; done`;
      expect(mix).toSucceed();
      expect(mix).toContainInOutput('OUT:1');
      expect(mix).toContainInOutput('OUT:5');
      expect(mix).toContainInOutput('ERR:1');
      expect(mix).toContainInOutput('ERR:5');

      // ANSI color codes
      const ansi = await $`printf "\\033[1;31mBOLD_RED\\033[0m \\033[4;32mUNDERLINE_GREEN\\033[0m \\033[7mINVERTED\\033[0m\\n"`;
      expect(ansi).toSucceed();
      expect(ansi).toContainInOutput('BOLD_RED');
      expect(ansi).toContainInOutput('UNDERLINE_GREEN');
      expect(ansi).toContainInOutput('INVERTED');

      // Special characters
      const special = await $`printf "TAB:\\there\\nQUOTE:\\"hello\\"\\nBACKSLASH:\\\\end\\n"`;
      expect(special).toSucceed();
      expect(special).toContainInOutput('TAB:');
      expect(special).toContainInOutput('QUOTE:');
      expect(special).toContainInOutput('BACKSLASH:');

      // Empty lines mixed with content
      const blanks = await $`echo "first"; echo; echo; echo "after blanks"; echo; echo "end"`;
      expect(blanks).toSucceed();
      expect(blanks).toContainInOutput('first');
      expect(blanks).toContainInOutput('after blanks');
      expect(blanks).toContainInOutput('end');

      // Very long single line
      const longLine = await $`python3 -c "print('A' * 500)" 2>/dev/null || printf "%0.sA" $(seq 1 500)`;
      expect(longLine).toSucceed();
      console.log('  500-char line captured');

      // Control characters
      const ctrl = await $`printf "normal\\x07BELL\\x08BS\\x1b[33myellow\\x1b[0m end\\n"`;
      expect(ctrl).toSucceed();
      expect(ctrl).toContainInOutput('normal');
      expect(ctrl).toContainInOutput('end');

      // Stderr only (PTY merges streams)
      const errOnly = await $`echo "only-error" >&2`;
      expect(errOnly).toSucceed();
      expect(errOnly).toContainInOutput('only-error');

      // Rapid sequential echo
      const rapid = await $`for i in $(seq 1 50); do echo "rapid:$i"; done`;
      expect(rapid).toSucceed();
      expect(rapid).toContainInOutput('rapid:1');
      expect(rapid).toContainInOutput('rapid:25');
      expect(rapid).toContainInOutput('rapid:50');

      // Long argument list
      const longArgs = await $`echo $(seq 1 100 | tr "\\n" " ")`;
      expect(longArgs).toSucceed();
      expect(longArgs).toContainInOutput('1');
      expect(longArgs).toContainInOutput('100');
      console.log('  all output scenarios verified');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Signals and process lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('Signals and process lifecycle', { record: true }, () => {
  test('EXIT trap, SIGTERM, then SIGINT and loop interrupt', async ({ $ }) => {
    await step('signals', { typingSpeed: 0 }, async () => {
      // Non-interactive first (before any interrupt disturbs shell state)

      // EXIT trap
      const exitTrap = await $`bash -c 'trap "echo EXIT_TRAP" EXIT; echo "before"; exit 0'`;
      expect(exitTrap).toSucceed();
      expect(exitTrap).toContainInOutput('before');
      expect(exitTrap).toContainInOutput('EXIT_TRAP');
      console.log('  EXIT trap → fired');

      // SIGTERM self-kill
      const term = await $`bash -c 'kill -TERM $$'`;
      expect(term).toFail();
      console.log(`  SIGTERM self → code=${term.code}`);

      // Interactive interrupt commands (may disturb shell state)

      // SIGINT with trap handler
      const trapped = $({ interactive: true })`bash -c 'trap "echo INTERRUPTED; exit 42" INT; echo "READY"; sleep 999'`;
      await trapped.expect('READY');
      await trapped.interrupt();
      await trapped.expect('INTERRUPTED');
      const trappedResult = await trapped;
      expect(trappedResult).toHaveExitCode(42);
      console.log(`  trap INT → code=${trappedResult.code}`);

      // SIGINT on plain sleep
      const plain = $({ interactive: true })`sleep 999`;
      await plain.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      await plain.interrupt();
      const plainResult = await plain;
      console.log(`  interrupt sleep → code=${plainResult.code}`);

      // Infinite loop interrupted
      const loop = $({ interactive: true })`bash -c 'echo "START"; while true; do sleep 0.1; done'`;
      await loop.expect('START');
      await loop.interrupt();
      const loopResult = await loop;
      console.log(`  loop interrupted → code=${loopResult.code}`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Exit codes
// ─────────────────────────────────────────────────────────────────────────────

describe('Exit codes', { record: true }, () => {
  test('sequences, boundaries, isolation, alternating, pipelines', async ({ $ }) => {
    await step('exit codes', { typingSpeed: 0 }, async () => {
      // Exit 0 through 5 (subshell to avoid killing the interactive shell)
      const codes: number[] = [];
      for (let i = 0; i <= 5; i++) {
        const r = await $`(exit ${i})`;
        codes.push(r.code);
        if (i === 0) expect(r).toSucceed();
        else expect(r).toFail();
      }
      console.log(`  exit 0-5: [${codes.join(', ')}]`);

      // Boundary: 255 (max), 256 (wraps to 0)
      const r255 = await $`(exit 255)`;
      expect(r255).toHaveExitCode(255);
      const r256 = await $`(exit 256)`;
      expect(r256).toHaveExitCode(0);
      console.log(`  exit 255 → ${r255.code}, exit 256 → ${r256.code}`);

      // Command not found
      const notFound = await $`__nonexistent_xyz__ 2>/dev/null`;
      expect(notFound).toFail();
      console.log(`  not found → code=${notFound.code}`);

      // Isolation: failure does not affect next command
      const fail = await $`(exit 99)`;
      expect(fail).toFail();
      const ok = await $`echo "clean slate"`;
      expect(ok).toSucceed();
      expect(ok).toContainInOutput('clean slate');

      // Rapid alternating success/failure (10 commands)
      const results: number[] = [];
      for (let i = 0; i < 10; i++) {
        const r = await $`(exit ${i % 2})`;
        results.push(r.code);
      }
      expect(results).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
      console.log(`  alternating 10x: [${results.join(',')}]`);

      // Pipeline: exit code from last stage
      const pipeOk = await $`false | echo "piped"`;
      expect(pipeOk).toSucceed();
      const pipeFail = await $`echo "hello" | grep nonexistent`;
      expect(pipeFail).toFail();
      expect(pipeFail).toHaveExitCode(1);
      console.log('  pipeline → last stage wins');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 6: Environment, metadata, and assertions
// ─────────────────────────────────────────────────────────────────────────────

describe('Environment, metadata, and assertions', { record: true }, () => {
  test('env, cwd, duration, snapshots, text matching, delayed output', async ({ $, terminal }) => {
    await step('env and metadata', { typingSpeed: 0 }, async () => {
      // Custom env variable (inline — RunOptions.env not supported in recording/PTY mode)
      const env = await $`CUSTOM_VAR=repterm_test_42 bash -c 'echo "val=$CUSTOM_VAR"'`;
      expect(env).toSucceed();
      expect(env).toContainInOutput('val=repterm_test_42');

      // Custom cwd (inline cd — RunOptions.cwd not supported in recording/PTY mode)
      const cwd = await $`cd /tmp && pwd`;
      expect(cwd).toSucceed();
      expect(cwd).toContainInOutput('/tmp');

      // Env + cwd combined
      const combo = await $`cd /tmp && TAG=MARKER bash -c 'echo "$TAG $(pwd)"'`;
      expect(combo).toSucceed();
      expect(combo).toContainInOutput('MARKER');
      expect(combo).toContainInOutput('/tmp');
      console.log('  env + cwd → verified');

      // Command field preserved
      const cmd = 'echo "track this command"';
      const tracked = await $`${raw(cmd)}`;
      expect(tracked.command).toBe(cmd);

      // Duration: slow command
      const slow = await $`sleep 0.2 && echo "timed"`;
      expect(slow).toSucceed();
      expect(slow.duration).toBeGreaterThan(100);
      console.log(`  slow command → ${slow.duration}ms`);

      // Duration: fast command
      const quick = await $`echo "instant"`;
      expect(quick).toSucceed();
      expect(quick.duration).toBeLessThan(3000);

      // Snapshot captures accumulated state
      await $`echo "MARKER_ALPHA"`;
      await $`echo "MARKER_BETA"`;
      await $`echo "MARKER_GAMMA"`;
      const snap = await terminal.snapshot();
      expect(snap).toContain('MARKER_ALPHA');
      expect(snap).toContain('MARKER_BETA');
      expect(snap).toContain('MARKER_GAMMA');
      console.log('  snapshot → 3 markers found');

      // toContainText
      await $`echo "unique-sentinel-xyzzy"`;
      await expect(terminal).toContainText('unique-sentinel-xyzzy');

      // toMatchPattern
      await $`echo "Version: 3.14.159"`;
      await expect(terminal).toMatchPattern(/Version: \d+\.\d+\.\d+/);

      // Negative assertions
      await $`echo "all good"`;
      await expect(terminal).not.toContainText('FATAL_ERROR');
      await expect(terminal).not.toMatchPattern(/CRITICAL|PANIC/i);

      // waitForText with delayed output
      const delayed = $({ interactive: true })`sleep 0.3 && echo "DELAYED_MARKER"`;
      await delayed.start();
      await terminal.waitForText('DELAYED_MARKER', { timeout: 5000 });
      console.log('  delayed output detected');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 7: Mixed workflows
// ─────────────────────────────────────────────────────────────────────────────

describe('Mixed workflows', { record: true }, () => {
  test('interactive + non-interactive, recovery, pipeline, file ops', async ({ $, terminal }) => {
    await step('mixed workflows', { typingSpeed: 0 }, async () => {
      // Interactive → non-interactive → snapshot
      const proc = $({ interactive: true })`bash -c 'read -p "Input: " val; echo "Echo: $val"'`;
      await proc.expect('Input:');
      await proc.send('test123');
      await proc.expect('Echo: test123');
      await proc;
      const r2 = await $`echo "non-interactive-check"`;
      expect(r2).toSucceed();
      const snap = await terminal.snapshot();
      expect(snap).toContain('test123');
      expect(snap).toContain('non-interactive-check');
      console.log('  interactive → non-interactive → snapshot verified');

      // Error recovery
      const fail = await $`false`;
      expect(fail).toFail();
      const recovered = await $`echo "RECOVERED"`;
      expect(recovered).toSucceed();
      expect(recovered).toContainInOutput('RECOVERED');
      await expect(terminal).toContainText('RECOVERED');
      console.log('  error recovery → verified');

      // Long pipeline
      const pipeline = await $`seq 1 100 | grep -E "^[0-9]{2}$" | sort -n | tail -5`;
      expect(pipeline).toSucceed();
      expect(pipeline).toContainInOutput('99');
      console.log('  long pipeline → output verified');

      // File write → read → cleanup
      const tmpFile = '/tmp/repterm-stress-' + Date.now();
      const w = await $`echo "payload:42" > ${tmpFile}`;
      expect(w).toSucceed();
      const r = await $`cat ${tmpFile}`;
      expect(r).toSucceed();
      expect(r).toContainInOutput('payload:42');
      const c = await $`rm -f ${tmpFile}`;
      expect(c).toSucceed();
      console.log('  file write/read/cleanup → verified');
    });
  });
});
