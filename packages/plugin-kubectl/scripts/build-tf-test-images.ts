#!/usr/bin/env bun
/**
 * One-time image preparation script for TensorFusion test suite.
 *
 * Builds pre-installed Docker images on a UCloud GPU node and creates a
 * UCloud custom image with warm containerd cache, eliminating pip install
 * delays during test execution.
 *
 * Run once to prepare the environment:
 *   bun packages/plugin-kubectl/scripts/build-tf-test-images.ts
 *
 * After running, update UCLOUD_CREATE_ARGS '--ImageId' in setup.ts with the
 * printed UCloud image ID so future nodes start with a warm image cache.
 *
 * Execution order:
 *   find/create GPU node → wait K8s node Ready
 *   → deploy privileged builder pod
 *   → nsenter into host mount ns → nerdctl pull/run/commit
 *   → delete builder pod
 *   → stop UHost → CreateCustomImage → wait Available
 *   → terminate UHost → print results
 */

import { $ } from 'bun';

// ===== Region / Project Constants (must match setup.ts) =====

const REGION = 'cn-wlcb';
const ZONE = 'cn-wlcb-01';
const PROJECT_ID = 'org-1szevn';

// ===== Image References =====

const BASE_PYTORCH_IMAGE =
  'registry.cn-hangzhou.aliyuncs.com/tensorfusion/pytorch:2.6.0-cuda12.4-cudnn9-runtime';

/**
 * Pre-built image tag written into the local containerd cache.
 * Uses the same tag as the base image so that:
 * - Tests reference the pullable registry tag
 * - On nodes with warm cache, the locally committed version (with pip packages
 *   and model files) transparently replaces the base image
 * - On fresh nodes without cache, K8s pulls the vanilla base from registry
 */
export const PREBUILT_PYTORCH_IMAGE = BASE_PYTORCH_IMAGE;

/**
 * All TensorFusion helm chart images (from `helm template ... -f values-cn.yaml`).
 * Pulled into the GPU node's containerd so future nodes boot with a warm cache.
 * certgen is pulled directly from k8s.m.daocloud.io with retry (registry.k8s.io
 * is blocked from UCloud cn-wlcb; k8s.m.daocloud.io has intermittent TLS issues
 * which the retry loop handles).
 */
const TF_IMAGES = [
  // TensorFusion operator (controller)
  'registry.cn-hangzhou.aliyuncs.com/tensorfusion/tensor-fusion-operator:1.48.6',
  // TensorFusion agent (runs on GPU node)
  'registry.cn-hangzhou.aliyuncs.com/tensorfusion/tensor-fusion-agent:1.0.0',
  // Observability stack
  'greptime-registry.cn-hangzhou.cr.aliyuncs.com/greptime/greptimedb:latest',
  'docker.m.daocloud.io/prom/alertmanager:v0.28.1',
  'docker.m.daocloud.io/timberio/vector:latest-alpine',
];

// ===== UCloud Args (mirrors setup.ts — only --ImageId may differ after first run) =====

const UCLOUD_CREATE_ARGS = [
  '--Action',
  'CreateUHostInstance',
  '--Quantity',
  '1',
  '--ChargeType',
  'Dynamic',
  '--LoginMode',
  'ImagePasswd',
  '--Tag',
  'Default',
  '--Name',
  'gpu',
  '--GpuType',
  'T4S',
  '--Features.UNI',
  'false',
  '--HotplugFeature',
  'false',
  '--NetCapability',
  'Normal',
  '--AutoDataDiskInit',
  'On',
  '--MinimalCpuPlatform',
  'Intel/Auto',
  '--MachineType',
  'G',
  '--Disks.0.BackupType',
  'NONE',
  '--Disks.0.Type',
  'CLOUD_SSD',
  '--Disks.0.Size',
  '100',
  '--Disks.0.IsBoot',
  'True',
  '--Memory',
  '16384',
  '--CPU',
  '8',
  '--GPU',
  '1',
  '--ImageId',
  'uimage-1nhwezwvwhol',
  '--SecurityGroupId',
  '325475',
  '--SecurityMode',
  'Firewall',
  '--SubnetId',
  'subnet-1hyousmpt270',
  '--VPCId',
  'uvnet-1hyousey4p4l',
  '--ProjectId',
  PROJECT_ID,
  '--Zone',
  ZONE,
  '--Region',
  REGION,
];

// ===== Privileged Builder Pod =====
// Uses hostPID + privileged + host rootfs mount so nsenter can enter the host
// mount namespace and run nerdctl (which lives on the host, not in the container).

const BUILDER_POD_YAML = `\
apiVersion: v1
kind: Pod
metadata:
  name: image-builder
  namespace: kube-system
spec:
  nodeSelector:
    kubernetes.io/hostname: gpu
  hostPID: true
  restartPolicy: Never
  containers:
  - name: builder
    image: ubuntu:22.04
    command: ["sleep", "3600"]
    securityContext:
      privileged: true
`;

const CPU_BUILDER_POD_YAML = `\
apiVersion: v1
kind: Pod
metadata:
  name: image-builder-cpu
  namespace: kube-system
spec:
  nodeSelector:
    kubernetes.io/hostname: cpu
  hostPID: true
  restartPolicy: Never
  tolerations:
    - operator: Exists
  containers:
  - name: builder
    image: ubuntu:22.04
    command: ["sleep", "3600"]
    securityContext:
      privileged: true
`;

// ===== Image Build Shell Script =====
// Runs inside the builder pod (ubuntu). nsenter enters the host mount namespace
// so nerdctl (on the host) can pull images into the k8s.io containerd namespace,
// which K8s uses — guaranteeing IfNotPresent cache hits for subsequent pods.
//
// The inner script is base64-encoded and piped to nsenter's bash to avoid all
// double-quote / variable-expansion issues that arise from nesting bash -c "...".

const INNER_SCRIPT = `set -e
export CONTAINERD_ADDRESS=/run/k3s/containerd/containerd.sock

# ── TensorFusion system images ───────────────────────────────
echo '[build] Pulling tensor-fusion-operator...'
nerdctl --namespace k8s.io pull registry.cn-hangzhou.aliyuncs.com/tensorfusion/tensor-fusion-operator:1.48.6

echo '[build] Pulling tensor-fusion-agent...'
nerdctl --namespace k8s.io pull registry.cn-hangzhou.aliyuncs.com/tensorfusion/tensor-fusion-agent:1.0.0

# certgen: registry.k8s.io is inaccessible from UCloud cn-wlcb (routes to europe-west3-docker.pkg.dev)
# k8s.m.daocloud.io can hang indefinitely on TLS — use timeout + retry.
echo '[build] Pulling certgen from k8s.m.daocloud.io (90s timeout, up to 5 attempts)...'
for i in 1 2 3 4 5; do
  timeout 90 nerdctl --namespace k8s.io pull k8s.m.daocloud.io/ingress-nginx/kube-webhook-certgen:v1.5.0 && break || true
  echo "[build] Attempt $i/5 timed out or failed, retrying in 10s..."
  sleep 10
done
nerdctl --namespace k8s.io inspect k8s.m.daocloud.io/ingress-nginx/kube-webhook-certgen:v1.5.0 >/dev/null || {
  echo '[build] ERROR: certgen pull failed after 5 attempts'
  exit 1
}

# ── Observability stack ──────────────────────────────────────
echo '[build] Pulling greptimedb...'
nerdctl --namespace k8s.io pull greptime-registry.cn-hangzhou.cr.aliyuncs.com/greptime/greptimedb:latest

echo '[build] Pulling alertmanager...'
nerdctl --namespace k8s.io pull docker.m.daocloud.io/prom/alertmanager:v0.28.1

echo '[build] Pulling vector...'
nerdctl --namespace k8s.io pull docker.m.daocloud.io/timberio/vector:latest-alpine

# ── pytorch test client image ────────────────────────────────
echo '[build] Pulling base pytorch image: ${BASE_PYTORCH_IMAGE}'
nerdctl --namespace k8s.io pull ${BASE_PYTORCH_IMAGE}

echo '[build] Checking if pip packages are already installed...'
if nerdctl --namespace k8s.io run --rm --pull=never ${BASE_PYTORCH_IMAGE} python3 -c "import transformers" >/dev/null 2>&1; then
  echo '[build] Pip packages already present in cached image, skipping.'
else
  echo '[build] Cleaning up any leftover pip-builder container...'
  nerdctl --namespace k8s.io rm -f pip-builder 2>/dev/null || true

  echo '[build] Running pip install (Tsinghua mirror)...'
  nerdctl --namespace k8s.io run --network=host --name pip-builder ${BASE_PYTORCH_IMAGE} \\
    pip install -i https://pypi.tuna.tsinghua.edu.cn/simple transformers accelerate

  echo '[build] Committing pre-built image over base tag: ${BASE_PYTORCH_IMAGE}'
  nerdctl --namespace k8s.io commit pip-builder ${BASE_PYTORCH_IMAGE}
  nerdctl --namespace k8s.io rm pip-builder
fi

echo '[build] All images cached successfully.'
`;

// Base64-encode the inner script so it can be safely embedded in the outer
// bash -c argument without any quoting or variable-expansion conflicts.
const innerB64 = Buffer.from(INNER_SCRIPT).toString('base64');

// Outer script runs in the ubuntu builder container. It decodes the inner script
// and pipes it directly to bash running inside the host mount namespace.
const BUILD_SCRIPT = `set -e
echo '${innerB64}' | base64 -d | nsenter --mount=/proc/1/ns/mnt -- bash
`;

// ===== CPU Node pytorch-only Build Script =====
// The CPU node is permanent and not recreated from a UCloud snapshot, so the
// prebuilt pytorch image must be built there separately. TF system images are
// only needed on the GPU node, so this script only handles the pytorch image.

const CPU_INNER_SCRIPT = `set -e
export CONTAINERD_ADDRESS=/run/k3s/containerd/containerd.sock

# Install nerdctl if not present (cpu node may only have k3s ctr)
if ! command -v nerdctl >/dev/null 2>&1; then
  echo '[build-cpu] nerdctl not found, downloading...'
  curl -sSL https://files.m.daocloud.io/github.com/containerd/nerdctl/releases/download/v2.0.2/nerdctl-2.0.2-linux-amd64.tar.gz | tar xz -C /tmp nerdctl
  export PATH=/tmp:$PATH
fi

echo '[build-cpu] Pulling base pytorch image: ${BASE_PYTORCH_IMAGE}'
nerdctl --namespace k8s.io pull ${BASE_PYTORCH_IMAGE}

echo '[build-cpu] Checking if pip packages, DeepSeek model, and MNIST data are already installed...'
if nerdctl --namespace k8s.io run --rm --pull=never --network=none ${BASE_PYTORCH_IMAGE} python3 -c \
    'import transformers; import os; assert os.path.isfile("/models/DeepSeek-R1-Distill-Qwen-1.5B/config.json"); assert os.path.isfile("/data/MNIST/raw/train-images-idx3-ubyte")' 2>/dev/null
then
  echo '[build-cpu] Pip packages, DeepSeek model, and MNIST data already present in cached image, skipping.'
  exit 0
fi

echo '[build-cpu] Cleaning up any leftover pip-builder container...'
nerdctl --namespace k8s.io rm -f pip-builder-cpu 2>/dev/null || true

echo '[build-cpu] Pulling base pytorch image: ${BASE_PYTORCH_IMAGE}'
nerdctl --namespace k8s.io pull ${BASE_PYTORCH_IMAGE}

# Write the model download script to a host temp file, then bind-mount it into the
# container. This avoids all shell quoting issues inside nerdctl run.
cat > /tmp/tf-build-download-model.py << 'PYEOF'
from huggingface_hub import snapshot_download
import os

model_id = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B'
local_dir = '/models/DeepSeek-R1-Distill-Qwen-1.5B'
os.makedirs(local_dir, exist_ok=True)
print(f'[build-cpu] Downloading {model_id} to {local_dir} via hf-mirror.com ...')
snapshot_download(
    model_id,
    local_dir=local_dir,
    ignore_patterns=['*.msgpack', '*.h5', '*.ot'],
)
print('[build-cpu] Model download complete')
PYEOF

echo '[build-cpu] Running pip install + model download + MNIST download inside container...'
nerdctl --namespace k8s.io run --network=host \\
  --mount type=bind,source=/tmp/tf-build-download-model.py,target=/tmp/download_model.py,readonly \\
  --name pip-builder-cpu ${BASE_PYTORCH_IMAGE} \\
  sh -c 'pip install -i https://pypi.tuna.tsinghua.edu.cn/simple transformers accelerate && HF_ENDPOINT=https://hf-mirror.com python3 /tmp/download_model.py && python3 -c "from torchvision import datasets; print(\"[build-cpu] Downloading MNIST...\"); datasets.MNIST(\"/data\", train=True, download=True); datasets.MNIST(\"/data\", train=False, download=True); print(\"[build-cpu] MNIST downloaded\")"'

rm -f /tmp/tf-build-download-model.py

echo '[build-cpu] Committing pre-built image over base tag: ${BASE_PYTORCH_IMAGE}'
nerdctl --namespace k8s.io commit pip-builder-cpu ${BASE_PYTORCH_IMAGE}
nerdctl --namespace k8s.io rm pip-builder-cpu

echo '[build-cpu] Done.'
`;

const cpuInnerB64 = Buffer.from(CPU_INNER_SCRIPT).toString('base64');

const CPU_BUILD_SCRIPT = `set -e
echo '${cpuInnerB64}' | base64 -d | nsenter --mount=/proc/1/ns/mnt -- bash
`;

// ===== UCloud API Helpers =====

interface UCloudResponse {
  RetCode: number;
  [key: string]: unknown;
}

async function ucloudAPI(args: string[]): Promise<UCloudResponse> {
  const output = await $`ucloud api ${args}`.text();
  return JSON.parse(output) as UCloudResponse;
}

async function queryGpuUhostId(): Promise<string | undefined> {
  const result = (await ucloudAPI([
    '--Action',
    'DescribeUHostInstance',
    '--Region',
    REGION,
    '--ProjectId',
    PROJECT_ID,
  ])) as UCloudResponse & { UHostSet?: Array<{ UHostId: string; GPU: number }> };
  if (result.RetCode !== 0) return undefined;
  return result.UHostSet?.find((h) => h.GPU >= 1)?.UHostId;
}

async function waitForUHostState(
  uhostId: string,
  targetState: string,
  timeoutMs = 300000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = (await ucloudAPI([
      '--Action',
      'DescribeUHostInstance',
      '--UHostIds.0',
      uhostId,
      '--Region',
      REGION,
      '--ProjectId',
      PROJECT_ID,
    ])) as UCloudResponse & { UHostSet?: Array<{ State: string }> };
    const state = result.UHostSet?.[0]?.State;
    console.log(`  UHost state: ${state ?? 'unknown'}`);
    if (state === targetState) return;
    await Bun.sleep(5000);
  }
  throw new Error(`Timeout: UHost ${uhostId} did not reach state '${targetState}'`);
}

async function waitForImageAvailable(imageId: string, timeoutMs = 600000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = (await ucloudAPI([
      '--Action',
      'DescribeImage',
      '--ImageId',
      imageId,
      '--Region',
      REGION,
      '--ProjectId',
      PROJECT_ID,
    ])) as UCloudResponse & { ImageSet?: Array<{ State: string }> };
    const state = result.ImageSet?.[0]?.State;
    console.log(`  UCloud image state: ${state ?? 'unknown'}`);
    if (state === 'Available') return;
    await Bun.sleep(10000);
  }
  throw new Error(`Timeout: UCloud image ${imageId} did not become Available`);
}

// ===== Main =====

async function main(): Promise<void> {
  // Step 1: Find or create the UCloud GPU node
  console.log('[build] Checking for existing GPU UHost...');
  let uhostId = await queryGpuUhostId();
  if (uhostId) {
    console.log(`[build] Using existing GPU node: ${uhostId}`);
  } else {
    console.log('[build] Creating GPU node...');
    const createResult = (await ucloudAPI(UCLOUD_CREATE_ARGS)) as UCloudResponse & {
      UHostIds?: string[];
    };
    if (createResult.RetCode !== 0 || !createResult.UHostIds?.length) {
      throw new Error(`Failed to create GPU node: ${JSON.stringify(createResult)}`);
    }
    uhostId = createResult.UHostIds[0];
    console.log(`[build] Created GPU node: ${uhostId}`);
  }

  // Step 2: Wait for the K8s node to become Ready
  console.log('[build] Waiting for K8s node/gpu to be Ready (timeout: 600s)...');
  await $`kubectl wait node/gpu --for=condition=Ready --timeout=600s`;
  console.log('[build] K8s node is Ready');

  // Step 3: Deploy the privileged builder pod on the GPU node
  console.log('[build] Deploying privileged builder pod...');
  const podYamlPath = '/tmp/image-builder-pod.yaml';
  await Bun.write(podYamlPath, BUILDER_POD_YAML);
  await $`kubectl apply -f ${podYamlPath}`;
  await $`kubectl wait pod/image-builder -n kube-system --for=condition=Ready --timeout=120s`;
  console.log('[build] Builder pod is ready');

  try {
    // Step 4: Run image build commands via nsenter into the host mount namespace
    console.log('[build] Building pre-installed image (this may take several minutes)...');
    await $`kubectl exec -n kube-system image-builder -- bash -c ${BUILD_SCRIPT}`;
    console.log(`[build] Pre-built image committed to local containerd: ${PREBUILT_PYTORCH_IMAGE}`);
  } finally {
    // Step 5: Remove the GPU builder pod regardless of outcome
    try {
      await $`kubectl delete pod image-builder -n kube-system --ignore-not-found`.quiet();
    } catch {
      /* ignore */
    }
    try {
      (await Bun.file(podYamlPath).exists()) &&
        (await import('fs/promises').then((fs) => fs.unlink(podYamlPath)));
    } catch {
      /* ignore */
    }
  }

  // Step 5b: Build pytorch prebuilt image on the CPU node.
  // The CPU node is permanent and not recreated from a UCloud snapshot, so it
  // must be built in-place each time this script runs.
  console.log('[build] Deploying builder pod on CPU node for pytorch prebuilt image...');
  const cpuPodYamlPath = '/tmp/image-builder-cpu-pod.yaml';
  await Bun.write(cpuPodYamlPath, CPU_BUILDER_POD_YAML);
  await $`kubectl delete pod image-builder-cpu -n kube-system --ignore-not-found`.quiet();
  await $`kubectl apply -f ${cpuPodYamlPath}`;
  await $`kubectl wait pod/image-builder-cpu -n kube-system --for=condition=Ready --timeout=120s`;
  console.log('[build] CPU builder pod is ready');
  try {
    console.log('[build] Building pytorch prebuilt image on CPU node...');
    await $`kubectl exec -n kube-system image-builder-cpu -- bash -c ${CPU_BUILD_SCRIPT}`;
    console.log('[build] Pytorch prebuilt image cached on CPU node');
  } finally {
    try {
      await $`kubectl delete pod image-builder-cpu -n kube-system --ignore-not-found`.quiet();
    } catch {
      /* ignore */
    }
    try {
      (await Bun.file(cpuPodYamlPath).exists()) &&
        (await import('fs/promises').then((fs) => fs.unlink(cpuPodYamlPath)));
    } catch {
      /* ignore */
    }
  }

  // Step 6: Stop UHost — CreateCustomImage requires the instance to be stopped
  console.log(`[build] Stopping UHost ${uhostId} for image snapshot...`);
  await ucloudAPI([
    '--Action',
    'StopUHostInstance',
    '--UHostId',
    uhostId,
    '--Region',
    REGION,
    '--ProjectId',
    PROJECT_ID,
  ]);
  await waitForUHostState(uhostId, 'Stopped');
  console.log('[build] UHost stopped');

  // Step 7: Create UCloud custom image from current VM disk state
  // The containerd layer cache (/var/lib/containerd) is preserved in the snapshot,
  // so future nodes started from this image will have all Docker images pre-cached.
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const imageName = `tf-test-prebuilt-${today}`;
  console.log(`[build] Creating UCloud custom image '${imageName}'...`);
  const createImageResult = (await ucloudAPI([
    '--Action',
    'CreateCustomImage',
    '--UHostId',
    uhostId,
    '--ImageName',
    imageName,
    '--Region',
    REGION,
    '--Zone',
    ZONE,
    '--ProjectId',
    PROJECT_ID,
  ])) as UCloudResponse & { ImageId?: string };
  if (createImageResult.RetCode !== 0 || !createImageResult.ImageId) {
    throw new Error(`Failed to create custom image: ${JSON.stringify(createImageResult)}`);
  }
  const newUCloudImageId = createImageResult.ImageId;
  console.log(`[build] UCloud image creation started: ${newUCloudImageId}`);

  // Step 8: Wait for the UCloud image to become Available
  console.log('[build] Waiting for UCloud image to become Available...');
  await waitForImageAvailable(newUCloudImageId);
  console.log('[build] UCloud image is Available');

  // Step 9: Permanently delete the build UHost (the custom image is now saved)
  console.log(`[build] Deleting GPU node ${uhostId}...`);
  await ucloudAPI([
    '--Action',
    'TerminateUHostInstance',
    '--UHostId',
    uhostId,
    '--Destroy',
    '1',
    '--ReleaseEIP',
    '1',
    '--Region',
    REGION,
    '--ProjectId',
    PROJECT_ID,
  ]);
  console.log('[build] GPU node deleted');

  // Step 10: Print actionable summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Build Complete');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  New Docker image tag:  ${PREBUILT_PYTORCH_IMAGE}`);
  console.log(`  New UCloud image ID:   ${newUCloudImageId}`);
  console.log('');
  console.log('  Next steps:');
  console.log('  1. In setup.ts, update UCLOUD_CREATE_ARGS:');
  console.log(`       '--ImageId', '${newUCloudImageId}',`);
  console.log('  2. 11-deepseek-inference.ts already references PREBUILT_PYTORCH_IMAGE');
  console.log('     from _config.ts — no further changes needed.');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('[build] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
