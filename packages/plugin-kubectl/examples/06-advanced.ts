/**
 * Example 6: Advanced Features
 *
 * Demonstrates kubectl plugin advanced API:
 * portForward, waitForService, getEvents, getNodes, cp
 *
 * Running instructions:
 *   bun run repterm packages/plugin-kubectl/examples/06-advanced.ts
 *
 * Prerequisites:
 *   - kubectl is configured and connected to a Kubernetes cluster
 */

import {
  describe,
  defineConfig,
  createTestWithPlugins,
} from 'repterm';
import { kubectlPlugin } from '@nexusgpu/repterm-plugin-kubectl';

// Configure plugin
const config = defineConfig({
  plugins: [kubectlPlugin({ namespace: 'default' })] as const,
});

const test = createTestWithPlugins(config);

// Test resources
const webAppYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      labels:
        app: webapp
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: webapp-svc
spec:
  selector:
    app: webapp
  ports:
  - port: 80
    targetPort: 80
`;

const filePodYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: file-pod
spec:
  containers:
  - name: main
    image: busybox
    command: ['sh', '-c', 'echo "test content" > /tmp/test.txt && sleep 3600']
`;

describe('Advanced Features API', () => {
  // ===== getNodes - Get node information =====
  test('getNodes - Get cluster nodes', async (ctx) => {
    const { kubectl } = ctx.plugins;

    const nodes = await kubectl.getNodes();
    for (const node of nodes) {
    }
  });

  test('getNodes - Filter using selector', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // Try filtering by label (may return empty)
    const controlPlaneNodes = await kubectl.getNodes({ selector: 'node-role.kubernetes.io/control-plane' });
  });

  // Setup test resources
  test('Setup: Create test resources', async (ctx) => {
    const { kubectl } = ctx.plugins;

    await kubectl.apply(webAppYaml);
    await kubectl.apply(filePodYaml);
    await kubectl.wait('deployment', 'webapp', 'Available', { timeout: 120000 });
    await kubectl.waitForPod('file-pod', 'Running', 60000);
  });

  // ===== getEvents - Get cluster events =====
  test('getEvents - Get namespace events', async (ctx) => {
    const { kubectl } = ctx.plugins;

    const events = await kubectl.getEvents();

    // Display recent events
    const recentEvents = events.slice(0, 5);
    for (const event of recentEvents) {
    }
  });

  test('getEvents - Filter using field selector', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // Filter events for specific resource
    const webappEvents = await kubectl.getEvents({
      fieldSelector: 'involvedObject.name=webapp',
    });
  });

  // ===== waitForService - Wait for Service to be ready =====
  test('waitForService - Wait for Service endpoints', async (ctx) => {
    const { kubectl } = ctx.plugins;

    const endpoint = await kubectl.waitForService('webapp-svc', 60000);
  });

  // ===== portForward - Port forwarding =====
  test('portForward - Port forward to Service', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // Start port forwarding
    const handle = await kubectl.portForward('svc/webapp-svc', '18080:80', { delay: 2000 });

    // Can test connection here
    // const response = await fetch('http://localhost:18080');

    // Stop port forwarding
    await handle.stop();
  });

  // ===== cp - File copying =====
  test('cp - Copy file from Pod to local', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // Copy file to local
    await kubectl.cp('file-pod:/tmp/test.txt', '/tmp/k8s-test.txt');
  });

  test('cp - 从本地复制文件到 Pod', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // 创建本地文件
    await ctx.terminal.run('echo "uploaded content" > /tmp/upload.txt');

    // 复制到 Pod
    await kubectl.cp('/tmp/upload.txt', 'file-pod:/tmp/uploaded.txt');

    // 验证
    await kubectl.exec('file-pod', 'cat /tmp/uploaded.txt');
  });

  // Cleanup
  test('Cleanup: Delete test resources', async (ctx) => {
    const { kubectl } = ctx.plugins;

    await kubectl.delete('deployment', 'webapp', { force: true });
    await kubectl.delete('service', 'webapp-svc', { force: true });
    await kubectl.delete('pod', 'file-pod', { force: true });

    // Cleanup local temporary files
    await ctx.terminal.run('rm -f /tmp/k8s-test.txt /tmp/upload.txt');

  });
});
