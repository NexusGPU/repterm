/**
 * Example: Lifecycle Hooks with beforeAll/afterAll
 *
 * Demonstrates the Playwright-style lifecycle hooks:
 * - beforeAll: runs once before all tests in a describe block
 * - afterAll: runs once after all tests in a describe block
 *
 * Context from beforeAll is passed to all tests and nested describes.
 */

import { describe, beforeAll, afterAll, test, type TestContext } from 'repterm';

interface DbConnection {
  host: string;
  port: number;
  connected: boolean;
}

interface TestUser {
  id: string;
  name: string;
  email: string;
}

interface Context extends TestContext {
  dbConnection?: DbConnection;
  testUser?: TestUser;
  permissions?: string[];
}

describe('Database Tests', () => {
  beforeAll(async () => {
    console.log('[DB] Setting up database connection...');

    // Simulate database connection
    const dbConnection = {
      host: 'localhost',
      port: 5432,
      connected: true,
    };

    // Return values are merged into context for all tests
    return { dbConnection };
  });

  afterAll(async (ctx) => {
    const { dbConnection } = ctx as Context;
    console.log(`[DB] Closing database connection to ${dbConnection?.host}...`);
  });

  test('database is connected', async (ctx) => {
    const { terminal, dbConnection } = ctx as Context;
    if (!dbConnection?.connected) {
      throw new Error('Database not connected');
    }
    await terminal.run(`echo "Connected to ${dbConnection!.host}:${dbConnection!.port}"`);
  });

  test('database host is correct', async (ctx) => {
    const { terminal, dbConnection } = ctx as Context;
    if (dbConnection?.host !== 'localhost') {
      throw new Error(`Expected host to be localhost, got ${dbConnection?.host}`);
    }
    await terminal.run(`echo "Host verified: ${dbConnection!.host}"`);
  });

  describe('User Operations', () => {
    beforeAll(async (ctx) => {
      const { dbConnection } = ctx as Context;
      console.log(`[USERS] Creating test users in ${dbConnection?.host}...`);

      // Create test user data
      return {
        testUser: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        },
      };
    });

    afterAll(async (ctx) => {
      const { testUser } = ctx as Context;
      console.log(`[USERS] Cleaning up test user: ${testUser?.name}`);
    });

    test('can create user', async (ctx) => {
      const { terminal, testUser, dbConnection } = ctx as Context;
      if (testUser?.id !== 'user-123') {
        throw new Error(`Expected user id to be user-123, got ${testUser?.id}`);
      }
      await terminal.run(`echo "Creating user ${testUser!.name} in ${dbConnection?.host}"`);
    });

    test('can fetch user by id', async (ctx) => {
      const { terminal, testUser } = ctx as Context;
      await terminal.run(`echo "Fetching user: ${testUser?.id}"`);
    });

    describe('User Permissions', () => {
      beforeAll(async (ctx) => {
        const { testUser } = ctx as Context;
        console.log(`[PERMS] Setting up permissions for ${testUser?.name}...`);

        return {
          permissions: ['read', 'write', 'delete'],
        };
      });

      afterAll(async () => {
        console.log('[PERMS] Revoking test permissions...');
      });

      test('user has read permission', async (ctx) => {
        const { terminal, testUser, permissions } = ctx as Context;
        if (!permissions?.includes('read')) {
          throw new Error('User does not have read permission');
        }
        await terminal.run(`echo "${testUser?.name} has permissions: ${permissions?.join(', ')}"`);
      });

      test('user has write permission', async (ctx) => {
        const { terminal, permissions } = ctx as Context;
        if (!permissions?.includes('write')) {
          throw new Error('User does not have write permission');
        }
        await terminal.run(`echo "Write permission granted"`);
      });
    });
  });
});
