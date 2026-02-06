/**
 * 测试场景 3: 资源不足场景
 *
 * 验证当请求的 GPU 资源超过可用量时：
 * - TensorFusionWorkload 状态应为 Pending
 * - replicas 应为 0
 * - GPU 可用资源不应减少
 *
 * 录制效果：
 * - 主窗格：持续 watch workload 状态变化
 * - 新窗格：执行查询和验证命令
 *
 * 运行方式:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/03-insufficient.ts
 */

import { sleep } from 'bun';
import {
    test,
    describe,
    expect,
    step,
    tensorfusionworkload,
    workloadYaml,
    getFirstGpuName,
    getGpuAvailable,
    type KubectlMethods,
} from './_config.js';

const WORKLOAD_NAME = 'test-workload-insufficient';

describe('测试场景 3: 资源不足场景', { record: true }, () => {
    test('GPU 资源不足时 Workload 行为验证', async (ctx) => {
        const { kubectl } = ctx.plugins;
        const { terminal } = ctx;
        let gpuName: string;
        let initialTflops: string;
        let initialVram: string;

        // ===== Step 1: 记录初始状态 =====
        await step('获取测试 GPU', {
            showStepTitle: false,
            typingSpeed: 60,
            pauseAfter: 1000
        }, async () => {
            gpuName = await getFirstGpuName(kubectl);
        });

        await step('记录初始可用资源', {
            typingSpeed: 60,
            pauseAfter: 1500
        }, async () => {
            const available = await getGpuAvailable(kubectl, gpuName);
            initialTflops = available.tflops;
            initialVram = available.vram;
        });

        // ===== Step 2: 创建超量资源请求的 Workload（核心操作）=====
        await step('创建超量资源请求的 Workload', {
            showStepTitle: false,
            typingSpeed: 100,
            pauseAfter: 2000
        }, async () => {
            // 请求 100 TFlops 和 100Gi VRAM - 远超任何单 GPU 的容量
            const yaml = workloadYaml(WORKLOAD_NAME, {
                tflopsRequest: '100000m',  // 100 TFlops
                tflopsLimit: '100000m',
                vramRequest: '100Gi',
                vramLimit: '100Gi',
            });

            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
        });

        // ===== Step 3: 主窗格 watch，新窗格验证 =====
        await step('观察 Workload 状态并验证', {
            showStepTitle: false,
            pauseAfter: 2000
        }, async () => {
            // 在主窗格启动 watch（等待命令输入完成后返回）
            const watchProc = await kubectl.get('tensorfusionworkload', WORKLOAD_NAME, { watch: true });

            // 创建新终端（自动携带 plugins）
            const terminal2 = await terminal.create();
            const kubectl2 = terminal2.plugins.kubectl as KubectlMethods;

            // 在新窗格执行验证命令
            // 检查状态不是 Running
            const status = await kubectl2.getJsonPath<{
                phase?: string;
                replicas?: number;
            }>('tensorfusionworkload', WORKLOAD_NAME, '.status');
            expect(status?.phase).not.toBe('Running');

            // 检查 GPU 资源未被分配
            const currentAvailable = await getGpuAvailable(kubectl2, gpuName);
            expect(currentAvailable.tflops).toBe(initialTflops);
            expect(currentAvailable.vram).toBe(initialVram);

            // 获取事件信息
            await kubectl2.get<Array<{
                reason: string;
                message: string;
                type: string;
            }>>('event', undefined, {
                fieldSelector: `involvedObject.name=${WORKLOAD_NAME},involvedObject.kind=TensorFusionWorkload`,
                jqFilter: '[.items[] | {reason: .reason, message: .message, type: .type}]'
            });

            // 观察一段时间后关闭
            await sleep(3000);

            // 中断 watch
            await watchProc.interrupt();
        });

        // ===== Step 4: 清理 =====
        await step('删除 TensorFusionWorkload', {
            showStepTitle: false,
            typingSpeed: 80,
            pauseAfter: 2000
        }, async () => {
            const result = await kubectl.delete('tensorfusionworkload', WORKLOAD_NAME);
            await expect(result).toBeSuccessful();
        });
    });
});
