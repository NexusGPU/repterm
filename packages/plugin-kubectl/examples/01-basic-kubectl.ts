/**
 * 示例 1: 基础 Kubectl 操作
 *
 * 演示 kubectl 插件的基础 API：apply, delete, get, exists, waitForPod
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/01-basic-kubectl.ts
 *
 * 前置条件:
 *   - 已配置 kubectl 并连接到 Kubernetes 集群
 */

import {
    describe,
    defineConfig,
    createTestWithPlugins,
    expect,
} from '../../repterm/src/index.js';
import { kubectlPlugin } from '../src/index.js';

// 配置插件
const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

// 测试用 Pod YAML
const nginxPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: nginx-test
  labels:
    app: nginx
    env: test
spec:
  containers:
  - name: nginx
    image: nginx:alpine
    ports:
    - containerPort: 80
`;

describe('基础 Kubectl API', { record: true }, () => {
    // ===== apply - 创建资源 =====
    test('apply - 创建 Pod', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 apply API 创建 Pod
        await kubectl.apply(nginxPodYaml);
    });

    // ===== waitForPod - 等待 Pod 就绪 =====
    test('waitForPod - 等待 Pod Running', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 waitForPod API 等待 Pod 进入 Running 状态
        await kubectl.waitForPod('nginx-test', 'Running', 60000);
    });

    // ===== exists - 检查资源是否存在 =====
    test('exists - 检查 Pod 存在', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 exists API 检查资源
        const podExists = await kubectl.exists('pod', 'nginx-test');
        if (!podExists) {
            throw new Error('Pod should exist');
        }

        // 检查不存在的资源
        const notExists = await kubectl.exists('pod', 'non-existent-pod');
        if (notExists) {
            throw new Error('Non-existent pod should not exist');
        }
    });

    // ===== get - 获取资源信息 =====
    test('get - 获取 Pod 信息', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 get API 获取资源 JSON
        const pod = await kubectl.get<{
            metadata: { name: string; labels: Record<string, string> };
            status: { phase: string };
        }>('pod', 'nginx-test');

        if (pod.metadata.name !== 'nginx-test') {
            throw new Error(`Expected pod name 'nginx-test', got '${pod.metadata.name}'`);
        }
    });

    // ===== run - 执行原始命令 =====
    test('run - 执行原始 kubectl 命令', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 run API 执行任意 kubectl 命令
        await kubectl.run('get pod nginx-test -o wide');
    });

    // ===== delete - 删除资源 =====
    test('delete - 删除 Pod', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 delete API 删除资源
        await kubectl.delete('pod', 'nginx-test', { force: true });

        // 验证已删除
        // 注意：删除可能需要一些时间
        await new Promise(resolve => setTimeout(resolve, 2000));
    });
});
