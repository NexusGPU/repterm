/**
 * 示例 2: 日志与调试
 *
 * 演示 kubectl 插件的调试 API：logs, exec, describe
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/02-debugging.ts
 *
 * 前置条件:
 *   - 已配置 kubectl 并连接到 Kubernetes 集群
 */

import {
    describe,
    defineConfig,
    createTestWithPlugins,
} from '../../repterm/src/index.js';
import { kubectlPlugin } from '../src/index.js';

// 配置插件
const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

// 测试用 Pod
const debugPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: debug-pod
  labels:
    app: debug
spec:
  containers:
  - name: main
    image: busybox
    command: ['sh', '-c', 'echo "Container started"; while true; do echo "heartbeat $(date)"; sleep 5; done']
`;

describe('日志与调试 API', () => {
    // 准备测试环境
    test('准备: 创建测试 Pod', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.apply(debugPodYaml);
        await kubectl.waitForPod('debug-pod', 'Running', 60000);
    });

    // ===== logs - 获取 Pod 日志 =====
    test('logs - 获取 Pod 日志', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 基础日志获取
        const logs = await kubectl.logs('debug-pod');
    });

    test('logs - 带选项获取日志', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 tail 选项限制行数
        await kubectl.logs('debug-pod', { tail: 5 });

        // 使用 since 选项按时间过滤
        await kubectl.logs('debug-pod', { since: '1m' });
    });

    // ===== exec - 在 Pod 中执行命令 =====
    test('exec - 执行简单命令', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 执行单个命令
        await kubectl.exec('debug-pod', 'hostname');
    });

    test('exec - 执行复杂命令', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 执行 shell 命令
        await kubectl.exec('debug-pod', ['sh', '-c', 'ls -la / && echo "done"']);
    });

    // ===== describe - 获取资源描述 =====
    test('describe - 获取 Pod 描述', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 获取详细描述
        const description = await kubectl.describe('pod', 'debug-pod');
    });

    test('describe - 获取所有 Pods 描述', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 不指定名称，获取所有资源的描述
        await kubectl.describe('pods');
    });

    // 清理
    test('清理: 删除测试 Pod', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.delete('pod', 'debug-pod', { force: true });
    });
});
