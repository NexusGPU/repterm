/**
 * Test Scenario 15: Connection Auto-Deletion (PDF 3.3)
 *
 * Verify that deleting a client pod cascades deletion to TensorFusionConnection
 * via ownerReferences:
 * - Create client pod (webhook auto-creates workload + connection)
 * - Verify connection exists
 * - Delete client pod
 * - Verify connection is automatically deleted
 *
 * Run with:
 *   bun run repterm packages/plugin-kubectl/examples/tensor-fusion/15-connection-auto-deletion.ts
 */

import {
  test,
  describe,
  expect,
  step,
  TIMEOUTS,
  TEST_GPU_POOL,
  clientPodYaml,
  getConnectionInfoFromPod,
  deleteResourceAndWait,
  waitFor,
} from './_config.js';

const CLIENT_POD_NAME = 'test-conn-deletion';

describe(
  'Test Scenario 15: Connection Auto-Deletion',
  { record: true },
  () => {
    test('Deleting client pod cascades deletion to TensorFusionConnection', async (ctx) => {
      const { kubectl } = ctx.plugins;
      let connName: string;

      await deleteResourceAndWait(kubectl, 'pod', CLIENT_POD_NAME);

      try {
        // ===== Step 1: Create client pod =====
        await step(
          'Create remote-mode client pod',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2500,
          },
          async () => {
            const yaml = clientPodYaml(CLIENT_POD_NAME, { poolName: TEST_GPU_POOL });
            const result = await kubectl.apply(yaml);
            await expect(result).toBeSuccessful();
          }
        );

        // ===== Step 2: Wait for pod Ready =====
        await step(
          'Wait for client pod Running',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            await kubectl.waitForPod(CLIENT_POD_NAME, 'Running', TIMEOUTS.POD_READY);
          }
        );

        // ===== Step 3: Get connection name from pod env =====
        await step(
          'Read connection info from pod env',
          {
            showStepTitle: false,
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const info = await getConnectionInfoFromPod(kubectl, CLIENT_POD_NAME);
            connName = info.connName;

            expect(connName.length).toBeGreaterThan(0);
          }
        );

        // ===== Step 4: Verify connection exists =====
        await step(
          'Verify TensorFusionConnection exists',
          {
            typingSpeed: 0,
            pauseAfter: 2000,
          },
          async () => {
            const exists = await kubectl.exists('tensorfusionconnection', connName);
            expect(exists).toBe(true);
          }
        );

        // ===== Step 5: Delete client pod =====
        await step(
          'Delete client pod',
          {
            typingSpeed: 0,
            pauseAfter: 3000,
          },
          async () => {
            const result = await kubectl.delete('pod', CLIENT_POD_NAME);
            await expect(result).toBeSuccessful();
          }
        );

        // ===== Step 6: Verify connection auto-deleted =====
        await step(
          'Verify TensorFusionConnection auto-deleted',
          {
            typingSpeed: 0,
            pauseAfter: 2500,
          },
          async () => {
            await waitFor(
              () => kubectl.exists('tensorfusionconnection', connName),
              (exists) => !exists,
              { description: 'TensorFusionConnection auto-deleted' }
            );
          }
        );
      } finally {
        await deleteResourceAndWait(kubectl, 'pod', CLIENT_POD_NAME);
      }
    });
  }
);
