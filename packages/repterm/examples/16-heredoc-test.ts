/**
 * Heredoc test: verifies that heredoc works in non-recording mode
 * but demonstrates the Bracketed Paste issue in recording mode.
 *
 * Non-recording: bun run repterm examples/16-heredoc-test.ts
 * Recording:     bun run repterm -r examples/16-heredoc-test.ts
 */

import { test, expect, describe, step } from 'repterm';

// ─── Non-recording: heredoc via stdin, no Bracketed Paste ────────────────────

describe('Heredoc (non-recording)', { record: true }, () => {
  test('multiline heredoc produces correct output', async ({ $ }) => {
    // command 字符串包含 \n → 在非录制模式下走 session.write(command + '\n')
    // 字节直接写入 PTY → readline 逐行处理 → heredoc reader 从 PTY buffer 读取 body → 正常
    const result = await $`cat << 'EOF'\nHello World\nLine 2\nEOF`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('Hello World');
    expect(result).toContainInOutput('Line 2');
    console.log('  heredoc (non-recording) → output captured');
  });

  test('heredoc with variable expansion', async ({ $ }) => {
    const result = await $`NAME=Test; cat << EOF\nHello $NAME\nEOF`;
    expect(result).toSucceed();
    expect(result).toContainInOutput('Hello Test');
    console.log('  heredoc with var expansion → correct');
  });
});

// ─── Recording: heredoc 会触发 Bracketed Paste，导致 heredoc body 丢失 ─────

describe('Heredoc (recording)', { record: true }, () => {
  test('multiline heredoc — will fail due to Bracketed Paste', async ({ $ }) => {
    await step('heredoc recording test', { typingSpeed: 0 }, async () => {
      // command 包含 \n → 录制模式下走 pasteWithTmux()
      // pasteWithTmux 用 \x1b[200~ ... \x1b[201~ 包裹 → readline 缓冲全部内容
      // Enter → readline 一次性返回全部内容给 bash
      // bash parser 处理 "cat << 'EOF'" → heredoc reader 再次调用 readline → 缓冲区已空 → 阻塞
      const result = await $`cat << 'EOF'\nHello World\nEOF`;
      expect(result).toSucceed();
      expect(result).toContainInOutput('Hello World');
      console.log('  heredoc (recording) → output captured');
    });
  });

  test('single-line command — works fine in recording', async ({ $ }) => {
    await step('single line test', { typingSpeed: 0 }, async () => {
      // 单行命令不含 \n → 不走 pasteWithTmux → 直接 session.write + Enter → 正常
      const result = await $`echo "Hello World"`;
      expect(result).toSucceed();
      expect(result).toContainInOutput('Hello World');
      console.log('  single-line (recording) → works');
    });
  });
});
