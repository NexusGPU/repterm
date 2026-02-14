/**
 * 示例 7: 测试组织结构
 *
 * 运行方式: bun run repterm examples/07-test-organization.ts
 */

import { test, describe, step, expect } from 'repterm';

describe('用户管理功能', () => {
  describe('用户注册', () => {
    test('成功注册新用户', async ({ $ }) => {
      await step('准备测试数据', async () => {
        console.log('    Preparing test data...');
      });

      await step('执行注册命令', async () => {
        const result = await $`echo "User registered: alice"`;
        expect(result).toSucceed();
      });

      await step('验证注册结果', async () => {
        const result = await $`echo "User exists: true"`;
        expect(result).toHaveStdout('true');
      });
    });

    test('注册失败：用户已存在', async ({ $ }) => {
      const result = await $`echo "Error: User already exists" >&2 && exit 1`;
      expect(result).toFail();
      expect(result).toHaveStderr('already exists');
    });
  });

  describe('用户登录', () => {
    test('成功登录', async ({ $ }) => {
      await step('发送登录请求', async () => {
        const result = await $`echo "Login successful"`;
        expect(result).toSucceed();
      });
    });
  });
});

describe('测试步骤详细示例', () => {
  test('带有多个步骤的完整测试流程', async ({ $ }) => {
    const setupResult = await step('环境准备', async () => {
      const result = await $`echo "Environment ready"`;
      expect(result).toSucceed();
      return result;
    });

    const mainResult = await step('执行主要操作', async () => {
      const result = await $`echo "Operation completed"`;
      expect(result).toSucceed();
      return result;
    });

    await step('验证结果', async () => {
      expect(setupResult).toSucceed();
      expect(mainResult).toHaveStdout('completed');
    });
  });

  test('步骤可以返回值', async ({ $ }) => {
    const version = await step('获取版本号', async () => {
      const result = await $`echo "1.2.3"`;
      return result.stdout.trim();
    });

    await step('验证版本号', async () => {
      if (version !== '1.2.3') {
        throw new Error(`Expected version to be 1.2.3, got ${version}`);
      }
    });
  });
});
