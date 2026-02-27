/**
 * Global environment setup for Tensor Fusion test suite.
 *
 * This file is automatically loaded before all test files in this directory
 * by repterm's directory loader. It provisions the cloud infrastructure
 * required for the test suite and tears it down after all tests complete.
 *
 * Execution order:
 *   beforeAll: check gpu node → (create if missing + wait Ready) → uninstall TF → install TF → wait Available → apply cluster CR → wait GPUPool Ready
 *   afterAll:  uninstall TF → delete GPU node
 */
import { beforeAll, afterAll, expect } from 'repterm';
import type { DollarFunction } from 'repterm';

const UCLOUD_CREATE_ARGS = [
  '--Action', 'CreateUHostInstance',
  '--Quantity', '1',
  '--ChargeType', 'Dynamic',
  '--LoginMode', 'ImagePasswd',
  '--Tag', 'Default',
  '--Name', 'gpu',
  '--GpuType', 'T4S',
  '--Features.UNI', 'false',
  '--HotplugFeature', 'false',
  '--NetCapability', 'Normal',
  '--AutoDataDiskInit', 'On',
  '--MinimalCpuPlatform', 'Intel/Auto',
  '--MachineType', 'G',
  '--Disks.0.BackupType', 'NONE',
  '--Disks.0.Type', 'CLOUD_SSD',
  '--Disks.0.Size', '100',
  '--Disks.0.IsBoot', 'True',
  '--Memory', '16384',
  '--CPU', '8',
  '--GPU', '1',
  '--ImageId', 'uimage-1j8dovqekzd8',
  '--SecurityGroupId', '325475',
  '--SecurityMode', 'Firewall',
  '--SubnetId', 'subnet-1hyousmpt270',
  '--VPCId', 'uvnet-1hyousey4p4l',
  '--ProjectId', 'org-1szevn',
  '--Zone', 'cn-wlcb-01',
  '--Region', 'cn-wlcb',
];

const UCLOUD_DESCRIBE_ARGS = [
  '--Action', 'DescribeUHostInstance',
  '--Region', 'cn-wlcb',
  '--ProjectId', 'org-1szevn',
];

async function queryGpuUhostId($: DollarFunction): Promise<string> {
  const output = (await $`ucloud api ${UCLOUD_DESCRIBE_ARGS}`).stdout;
  const result = JSON.parse(output) as {
    RetCode: number;
    UHostSet: Array<{ UHostId: string; GPU: number }>;
  };
  if (result.RetCode !== 0) {
    throw new Error(`Failed to query UHost instances: ${JSON.stringify(result)}`);
  }
  const gpuInstance = result.UHostSet?.find(h => h.GPU >= 1);
  if (!gpuInstance) {
    throw new Error('No GPU UHost instance found in UCloud');
  }
  return gpuInstance.UHostId;
}

beforeAll(async (ctx) => {
  const { $ } = ctx;

  // Step 1: Check if the gpu node already exists and is Ready
  const nodeCheck = await $`kubectl get node gpu --no-headers`;
  const gpuNodeReady = nodeCheck.code === 0 &&
    nodeCheck.stdout.includes('Ready') &&
    !nodeCheck.stdout.includes('NotReady');

  let uhostId: string;

  if (gpuNodeReady) {
    // Node already ready — query existing uhost-id from UCloud
    console.log('[setup] GPU node already Ready, querying existing uhost-id...');
    uhostId = await queryGpuUhostId($);
    console.log(`[setup] Found existing GPU node: ${uhostId}`);
  } else {
    // Step 1a: Create GPU node via ucloud
    const createOutput = (await $`ucloud api ${UCLOUD_CREATE_ARGS}`).stdout;
    const createResult = JSON.parse(createOutput) as {
      RetCode: number;
      UHostIds: string[];
    };

    if (createResult.RetCode !== 0) {
      throw new Error(`Failed to create GPU node: ${JSON.stringify(createResult)}`);
    }

    uhostId = createResult.UHostIds[0];
    console.log(`[setup] Created GPU node: ${uhostId}`);

    // Step 1b: Wait for the node to become Ready (node name is always "gpu")
    // kubectl timeout is 600s, use 660s repterm timeout to allow kubectl to report the error
    console.log('[setup] Waiting for GPU node to become Ready...');
    const waitNode = await $({ timeout: 660000 })`kubectl wait node/gpu --for=condition=Ready --timeout=600s`;
    expect(waitNode).toSucceed();
    console.log('[setup] GPU node is Ready');
  }

  // Step 2: Remove existing TensorFusion installation (ignore errors if not installed)
  await $({ timeout: 120000 })`helm uninstall tensor-fusion-sys --namespace tensor-fusion-sys --ignore-not-found`;

  // Step 3: Install TensorFusion
  await $({ timeout: 360000 })`helm upgrade --install --create-namespace --namespace tensor-fusion-sys --repo https://download.tensor-fusion.ai --set agent.agentId="" -f https://download.tensor-fusion.ai/values-cn.yaml tensor-fusion-sys tensor-fusion`;
  console.log('[setup] TensorFusion installed');

  // Step 4: Wait for controller deployment to exist, then wait for Available
  console.log('[setup] Waiting for TensorFusion controller deployment to be created...');
  for (;;) {
    const check = await $`kubectl get deployment/tensor-fusion-sys-controller -n tensor-fusion-sys --no-headers`;
    if (check.code === 0) break;
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('[setup] Waiting for TensorFusion controller to be Ready...');
  const waitController = await $({ timeout: 360000 })`kubectl wait deployment/tensor-fusion-sys-controller -n tensor-fusion-sys --for=condition=Available --timeout=300s`;
  expect(waitController).toSucceed();
  console.log('[setup] TensorFusion controller is Ready');

  // Step 5: Apply TensorFusionCluster and SchedulingConfigTemplate
  await $`kubectl apply -f https://app.tensor-fusion.ai/tmpl/tf-cluster`;
  await $`kubectl apply -f https://app.tensor-fusion.ai/tmpl/tf-scheduling-config`;
  console.log('[setup] TensorFusionCluster and SchedulingConfigTemplate applied');

  // Step 6: Wait for GPUPool to become Ready
  console.log('[setup] Waiting for GPUPool to be Ready...');
  const waitPool = await $({ timeout: 360000 })`kubectl wait gpupool --all --for=jsonpath='{.status.phase}'=Running --timeout=300s`;
  expect(waitPool).toSucceed();
  console.log('[setup] GPUPool is Ready');

  return { uhostId };
});

afterAll(async (ctx) => {
  const { $, uhostId } = ctx as { $: DollarFunction; uhostId?: string };

  // Step 1: Remove TensorFusion
  await $({ timeout: 120000 })`helm uninstall tensor-fusion-sys --namespace tensor-fusion-sys --ignore-not-found`;
  console.log('[setup] TensorFusion uninstalled');

  // Step 3: Delete GPU node using the uhost-id saved in beforeAll
  if (uhostId) {
    const proc = $({ interactive: true, timeout: 600000 })`ucloud uhost delete --destroy --release-eip --region cn-wlcb --project-id org-1szevn --uhost-id ${uhostId}`;
    await proc.expect('(y/n)');
    await proc.send('y');
    await proc;
    console.log(`[setup] Deleted GPU node: ${uhostId}`);
  }
});
