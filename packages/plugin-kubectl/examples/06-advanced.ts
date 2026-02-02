/**
 * 示例 6: 进阶功能
 *
 * 演示 kubectl 插件的进阶 API：
 * portForward, waitForService, getEvents, getNodes, cp
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/06-advanced.ts
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

// 测试用资源
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

describe('进阶功能 API', () => {
  // ===== getNodes - 获取节点信息 =====
  test('getNodes - 获取集群节点', async (ctx) => {
    const { kubectl } = ctx.plugins;

    const nodes = await kubectl.getNodes();
    for (const node of nodes) {
    }
  });

  test('getNodes - 使用选择器过滤', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // 尝试按标签过滤（可能返回空）
    const controlPlaneNodes = await kubectl.getNodes({ selector: 'node-role.kubernetes.io/control-plane' });
  });

  // 准备测试资源
  test('准备: 创建测试资源', async (ctx) => {
    const { kubectl } = ctx.plugins;

    await kubectl.apply(webAppYaml);
    await kubectl.apply(filePodYaml);
    await kubectl.wait('deployment', 'webapp', 'Available', { timeout: 120000 });
    await kubectl.waitForPod('file-pod', 'Running', 60000);
  });

  // ===== getEvents - 获取集群事件 =====
  test('getEvents - 获取命名空间事件', async (ctx) => {
    const { kubectl } = ctx.plugins;

    const events = await kubectl.getEvents();

    // 显示最近几个事件
    const recentEvents = events.slice(0, 5);
    for (const event of recentEvents) {
    }
  });

  test('getEvents - 使用字段选择器过滤', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // 过滤特定资源的事件
    const webappEvents = await kubectl.getEvents({
      fieldSelector: 'involvedObject.name=webapp',
    });
  });

  // ===== waitForService - 等待 Service 就绪 =====
  test('waitForService - 等待 Service 有 endpoints', async (ctx) => {
    const { kubectl } = ctx.plugins;

    const endpoint = await kubectl.waitForService('webapp-svc', 60000);
  });

  // ===== portForward - 端口转发 =====
  test('portForward - 端口转发到 Service', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // 启动端口转发
    const handle = await kubectl.portForward('svc/webapp-svc', '18080:80', { delay: 2000 });

    // 可以在这里测试连接
    // const response = await fetch('http://localhost:18080');

    // 停止端口转发
    await handle.stop();
  });

  // ===== cp - 文件复制 =====
  test('cp - 从 Pod 复制文件到本地', async (ctx) => {
    const { kubectl } = ctx.plugins;

    // 复制文件到本地
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

  // 清理
  test('清理: 删除测试资源', async (ctx) => {
    const { kubectl } = ctx.plugins;

    await kubectl.delete('deployment', 'webapp', { force: true });
    await kubectl.delete('service', 'webapp-svc', { force: true });
    await kubectl.delete('pod', 'file-pod', { force: true });

    // 清理本地临时文件
    await ctx.terminal.run('rm -f /tmp/k8s-test.txt /tmp/upload.txt');

  });
});
