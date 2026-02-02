/**
 * 示例 5: K8s Matchers
 *
 * 演示 kubectl 插件的 expect matchers：
 * toExistInCluster, toBeRunning, toHavePhase, toHaveReplicas,
 * toHaveAvailableReplicas, toBeAvailable, toHaveLabel, toHaveAnnotation, toHaveCondition
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/05-matchers.ts
 *
 * 前置条件:
 *   - 已配置 kubectl 并连接到 Kubernetes 集群
 */

import {
    describe,
    defineConfig,
    createTestWithPlugins,
    expect,
} from 'repterm';
import { kubectlPlugin, pod, deployment, registerK8sMatchers } from '../src/index.js';

// 注册 K8s matchers
registerK8sMatchers();

// 配置插件
const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

// 测试资源 YAML
const testPodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: matcher-pod
  labels:
    app: matcher-test
    env: test
  annotations:
    description: Test pod for matchers
spec:
  containers:
  - name: nginx
    image: nginx:alpine
`;

const testDeploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: matcher-deploy
  labels:
    app: matcher-deploy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: matcher-deploy
  template:
    metadata:
      labels:
        app: matcher-deploy
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
`;

describe('K8s Matchers', () => {
    // 准备测试资源
    test('准备: 创建测试资源', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.apply(testPodYaml);
        await kubectl.apply(testDeploymentYaml);
        await kubectl.waitForPod('matcher-pod', 'Running', 60000);
        await kubectl.wait('deployment', 'matcher-deploy', 'Available', { timeout: 120000 });
    });

    // ===== toExistInCluster - 验证资源存在 =====
    test('toExistInCluster - 验证 Pod 存在', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 pod() helper 创建资源包装器
        await expect(pod(kubectl, 'matcher-pod')).toExistInCluster();
    });

    test('toExistInCluster - 验证 Deployment 存在', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toExistInCluster();
    });

    // ===== toBeRunning - 验证 Pod Running =====
    test('toBeRunning - 验证 Pod Running 状态', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(pod(kubectl, 'matcher-pod')).toBeRunning();
    });

    // ===== toHavePhase - 验证 Pod 阶段 =====
    test('toHavePhase - 验证 Pod 阶段', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(pod(kubectl, 'matcher-pod')).toHavePhase('Running');
    });

    // ===== toHaveReplicas - 验证副本数 =====
    test('toHaveReplicas - 验证 Deployment 副本数', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toHaveReplicas(2);
    });

    // ===== toHaveAvailableReplicas - 验证可用副本数 =====
    test('toHaveAvailableReplicas - 验证可用副本数', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toHaveAvailableReplicas(2);
    });

    // ===== toBeAvailable - 验证 Deployment 可用 =====
    test('toBeAvailable - 验证 Deployment 可用', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toBeAvailable();
    });

    // ===== toHaveLabel - 验证标签 =====
    test('toHaveLabel - 验证 Pod 标签存在', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 只检查标签是否存在
        await expect(pod(kubectl, 'matcher-pod')).toHaveLabel('app');
    });

    test('toHaveLabel - 验证 Pod 标签值', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 检查标签的具体值
        await expect(pod(kubectl, 'matcher-pod')).toHaveLabel('app', 'matcher-test');

        await expect(pod(kubectl, 'matcher-pod')).toHaveLabel('env', 'test');
    });

    // ===== toHaveAnnotation - 验证注解 =====
    test('toHaveAnnotation - 验证 Pod 注解', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(pod(kubectl, 'matcher-pod')).toHaveAnnotation('description');

        await expect(pod(kubectl, 'matcher-pod')).toHaveAnnotation('description', 'Test pod for matchers');
    });

    // ===== toHaveCondition - 验证条件 =====
    test('toHaveCondition - 验证 Deployment 条件', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toHaveCondition('Available', 'True');
    });

    // ===== not. 否定断言 =====
    test('not.toExistInCluster - 验证资源不存在', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(pod(kubectl, 'non-existent-pod')).not.toExistInCluster();
    });

    // 清理
    test('清理: 删除测试资源', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.delete('pod', 'matcher-pod', { force: true });
        await kubectl.delete('deployment', 'matcher-deploy', { force: true });
    });
});
