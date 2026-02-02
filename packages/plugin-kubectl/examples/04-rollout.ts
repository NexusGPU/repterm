/**
 * 示例 4: 发布管理 (Rollout)
 *
 * 演示 kubectl 插件的 rollout API：status, history, restart, undo, pause, resume
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/04-rollout.ts
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

// 测试用 Deployment
const appDeploymentYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deploy
  annotations:
    kubernetes.io/change-cause: "Initial deployment"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: nginx:1.20-alpine
        ports:
        - containerPort: 80
`;

describe('发布管理 (Rollout) API', () => {
    // 准备测试环境
    test('准备: 创建测试 Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.apply(appDeploymentYaml);
        await kubectl.wait('deployment', 'app-deploy', 'Available', { timeout: 120000 });
    });

    // ===== rollout.status - 获取发布状态 =====
    test('rollout.status - 获取发布状态', async (ctx) => {
        const { kubectl } = ctx.plugins;

        const status = await kubectl.rollout.status('deployment', 'app-deploy');
    });

    // ===== rollout.history - 获取发布历史 =====
    test('rollout.history - 获取发布历史', async (ctx) => {
        const { kubectl } = ctx.plugins;

        const history = await kubectl.rollout.history('deployment', 'app-deploy');
        for (const entry of history) {
        }
    });

    // ===== rollout.restart - 重启 Deployment =====
    test('rollout.restart - 重启 Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.rollout.restart('deployment', 'app-deploy');

        // 等待重启完成
        await kubectl.wait('deployment', 'app-deploy', 'Available', { timeout: 120000 });
    });

    // ===== rollout.pause / resume - 暂停/恢复发布 =====
    test('rollout.pause - 暂停发布', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.rollout.pause('deployment', 'app-deploy');
    });

    test('rollout.resume - 恢复发布', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.rollout.resume('deployment', 'app-deploy');
    });

    // 触发新版本以便测试回滚
    test('触发镜像更新', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 使用 patch 更新镜像
        await kubectl.patch('deployment', 'app-deploy', {
            spec: {
                template: {
                    spec: {
                        containers: [{
                            name: 'app',
                            image: 'nginx:1.21-alpine',
                        }],
                    },
                },
            },
        });

        // 添加变更原因注解
        await kubectl.annotate('deployment', 'app-deploy', {
            'kubernetes.io/change-cause': 'Update to nginx:1.21',
        });

        await kubectl.wait('deployment', 'app-deploy', 'Available', { timeout: 120000 });
    });

    // ===== rollout.undo - 回滚 =====
    test('rollout.undo - 回滚到上一版本', async (ctx) => {
        const { kubectl } = ctx.plugins;

        await kubectl.rollout.undo('deployment', 'app-deploy');

        await kubectl.wait('deployment', 'app-deploy', 'Available', { timeout: 120000 });
    });

    test('rollout.undo - 回滚到指定版本', async (ctx) => {
        const { kubectl } = ctx.plugins;

        // 获取历史，找到可用的版本
        const history = await kubectl.rollout.history('deployment', 'app-deploy');
        if (history.length > 1) {
            const targetRevision = history[0].revision;
            await kubectl.rollout.undo('deployment', 'app-deploy', targetRevision);
        } else {
        }
    });

    // 清理
    test('清理: 删除测试 Deployment', async (ctx) => {
        const { kubectl } = ctx.plugins;
        await kubectl.delete('deployment', 'app-deploy', { force: true });
    });
});
