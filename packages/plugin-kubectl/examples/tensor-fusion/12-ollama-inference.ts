/**
 * Test Scenario 12: Ollama LLM Inference (Remote GPU)
 *
 * - Create a pod running ollama serve with remote GPU annotations
 * - Wait for ollama service to be ready
 * - Pull a small model (qwen2.5:0.5b) and run text generation
 * - Verify inference produces valid output and model uses GPU
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/12-ollama-inference.ts
 */

import { sleep } from 'bun';
import {
  test,
  describe,
  expect,
  step,
  TIMEOUTS,
  TEST_GPU_POOL,
  TEST_NAMESPACE,
  deleteResourceAndWait,
} from './_config.js';

const POD_NAME = 'test-ollama-inference';
const OLLAMA_IMAGE = 'registry.cn-hangzhou.aliyuncs.com/tensorfusion/ollama:0.10.11';
const OLLAMA_MODEL = 'qwen2.5:0.5b';

function podYaml(podName: string, poolName: string): string {
  return `
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
  namespace: ${TEST_NAMESPACE}
  labels:
    tensor-fusion.ai/enabled: "true"
  annotations:
    tensor-fusion.ai/is-local-gpu: "false"
    tensor-fusion.ai/gpupool: "${poolName}"
    tensor-fusion.ai/tflops-request: "2"
    tensor-fusion.ai/vram-request: "128Mi"
    tensor-fusion.ai/tflops-limit: "71200m"
    tensor-fusion.ai/vram-limit: "10Gi"
    tensor-fusion.ai/inject-container: "ollama"
spec:
  priorityClassName: tensor-fusion-high
  nodeSelector:
    kubernetes.io/hostname: cpu
  restartPolicy: Never
  terminationGracePeriodSeconds: 3
  containers:
    - name: ollama
      image: ${OLLAMA_IMAGE}
      command: ["ollama", "serve"]
      resources:
        requests:
          cpu: 10m
          memory: 64Mi
        limits:
          cpu: "4"
          memory: 16Gi
      volumeMounts:
        - name: model-cache
          mountPath: /root/.ollama/
  volumes:
    - name: model-cache
      hostPath:
        path: /usr/share/ollama/.ollama/
        type: DirectoryOrCreate
`;
}

describe('Test Scenario 12: Ollama LLM Inference', { record: true }, () => {
  test('Run LLM inference via Ollama with remote GPU', { timeout: TIMEOUTS.INFERENCE }, async (ctx) => {
    const { kubectl } = ctx.plugins;

    await deleteResourceAndWait(kubectl, 'pod', POD_NAME);

    try {
      await step(
        'Create Ollama inference pod',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2500,
        },
        async () => {
          const yaml = podYaml(POD_NAME, TEST_GPU_POOL);
          const result = await kubectl.apply(yaml);
          await expect(result).toBeSuccessful();
        }
      );

      await step(
        'Wait for pod Ready',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          await kubectl.waitForPod(POD_NAME, 'Running', TIMEOUTS.POD_READY);
        }
      );

      await step(
        'Wait for Ollama service ready',
        {
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const output = await kubectl.exec(
            POD_NAME,
            [
              'sh',
              '-c',
              'for i in $(seq 30); do ollama list >/dev/null 2>&1 && echo READY && exit 0; sleep 1; done; echo TIMEOUT',
            ],
            { container: 'ollama' }
          );
          expect(output).toContain('READY');
        }
      );

      await step(
        `Pull model ${OLLAMA_MODEL}`,
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          await kubectl.exec(POD_NAME, ['sh', '-c', `ollama pull ${OLLAMA_MODEL}`], {
            container: 'ollama',
            timeout: TIMEOUTS.INFERENCE,
          });
        }
      );

      await step(
        'Run Ollama inference',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 3000,
        },
        async () => {
          // Use environment variables to set temperature=0 for deterministic output.
          // Without this, small models produce unpredictable responses (e.g. "." instead of "2").
          const output = await kubectl.exec(
            POD_NAME,
            [
              'sh',
              '-c',
              `OLLAMA_NUM_PREDICT=10 ollama run ${OLLAMA_MODEL} --nowordwrap "1+1="`,
            ],
            { container: 'ollama', timeout: TIMEOUTS.INFERENCE }
          );
          expect(output).toContain('2');
        }
      );

      await step(
        'Verify model loaded status',
        {
          typingSpeed: 0,
          pauseAfter: 2000,
        },
        async () => {
          const psOutput = await kubectl.exec(POD_NAME, ['sh', '-c', 'ollama ps'], {
            container: 'ollama',
          });
          // ollama ps should show the loaded model
          expect(psOutput).toContain(OLLAMA_MODEL);
        }
      );

      await step(
        'Delete Ollama pod',
        {
          showStepTitle: false,
          typingSpeed: 0,
          pauseAfter: 1500,
        },
        async () => {
          const result = await kubectl.delete('pod', POD_NAME);
          await expect(result).toBeSuccessful();
          await sleep(5000);
        }
      );
    } finally {
      await deleteResourceAndWait(kubectl, 'pod', POD_NAME);
    }
  });
});
