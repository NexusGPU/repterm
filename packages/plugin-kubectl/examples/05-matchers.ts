/**
 * Example 5: K8s Matchers
 *
 * Demonstrates kubectl plugin expect matchers:
 * toExistInCluster, toBeRunning, toHavePhase, toHaveReplicas,
 * toHaveAvailableReplicas, toBeAvailable, toHaveLabel, toHaveAnnotation, toHaveCondition
 *
 * Running instructions:
 *   bun run repterm packages/plugin-kubectl/examples/05-matchers.ts
 *
 * Prerequisites:
 *   - kubectl is configured and connected to a Kubernetes cluster
 */

import {
    describe,
    defineConfig,
    createTestWithPlugins,
    expect,
} from 'repterm';
import { kubectlPlugin, pod, deployment, registerK8sMatchers } from '../src/index.js';

// Register K8s matchers
registerK8sMatchers();

// Configure plugin
const config = defineConfig({
    plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

// Test resource YAML
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
    // Setup test resources
    test('Setup: Create test resources', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.apply(testPodYaml);
        await kubectl.apply(testDeploymentYaml);
        await kubectl.waitForPod('matcher-pod', 'Running', 60000);
        await kubectl.wait('deployment', 'matcher-deploy', 'Available', { timeout: 120000 });
    });

    // ===== toExistInCluster - Verify resource exists =====
    test('toExistInCluster - Verify Pod exists', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Use pod() helper to create resource wrapper
        await expect(pod(kubectl, 'matcher-pod')).toExistInCluster();
    });

    test('toExistInCluster - Verify Deployment exists', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toExistInCluster();
    });

    // ===== toBeRunning - Verify Pod Running =====
    test('toBeRunning - Verify Pod Running status', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(pod(kubectl, 'matcher-pod')).toBeRunning();
    });

    // ===== toHavePhase - Verify Pod phase =====
    test('toHavePhase - Verify Pod phase', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(pod(kubectl, 'matcher-pod')).toHavePhase('Running');
    });

    // ===== toHaveReplicas - Verify replica count =====
    test('toHaveReplicas - Verify Deployment replicas', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toHaveReplicas(2);
    });

    // ===== toHaveAvailableReplicas - Verify available replicas =====
    test('toHaveAvailableReplicas - Verify available replicas', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toHaveAvailableReplicas(2);
    });

    // ===== toBeAvailable - Verify Deployment available =====
    test('toBeAvailable - Verify Deployment available', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toBeAvailable();
    });

    // ===== toHaveLabel - Verify labels =====
    test('toHaveLabel - Verify Pod label exists', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Only check if label exists
        await expect(pod(kubectl, 'matcher-pod')).toHaveLabel('app');
    });

    test('toHaveLabel - Verify Pod label value', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // Check label's specific value
        await expect(pod(kubectl, 'matcher-pod')).toHaveLabel('app', 'matcher-test');

        await expect(pod(kubectl, 'matcher-pod')).toHaveLabel('env', 'test');
    });

    // ===== toHaveAnnotation - Verify annotations =====
    test('toHaveAnnotation - Verify Pod annotation', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(pod(kubectl, 'matcher-pod')).toHaveAnnotation('description');

        await expect(pod(kubectl, 'matcher-pod')).toHaveAnnotation('description', 'Test pod for matchers');
    });

    // ===== toHaveCondition - Verify conditions =====
    test('toHaveCondition - Verify Deployment condition', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(deployment(kubectl, 'matcher-deploy')).toHaveCondition('Available', 'True');
    });

    // ===== not. Negation assertions =====
    test('not.toExistInCluster - Verify resource does not exist', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await expect(pod(kubectl, 'non-existent-pod')).not.toExistInCluster();
    });

    // Cleanup
    test('Cleanup: Delete test resources', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.delete('pod', 'matcher-pod', { force: true });
        await kubectl.delete('deployment', 'matcher-deploy', { force: true });
    });
});
