import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '../../../../');
const rootPackageJson = await Bun.file(path.join(rootDir, 'package.json')).json();
const reptermPackageJson = await Bun.file(path.join(rootDir, 'packages/repterm/package.json')).json();
const pluginApiPackageJson = await Bun.file(path.join(rootDir, 'packages/plugin-api/package.json')).json();
const pluginKubectlPackageJson = await Bun.file(path.join(rootDir, 'packages/plugin-kubectl/package.json')).json();

const reptermExpectFile = await Bun.file(path.join(rootDir, 'packages/repterm/src/api/expect.ts')).text();
const reptermPluginFile = await Bun.file(path.join(rootDir, 'packages/repterm/src/plugin/index.ts')).text();
const kubectlIndexFile = await Bun.file(path.join(rootDir, 'packages/plugin-kubectl/src/index.ts')).text();
const kubectlMatchersFile = await Bun.file(path.join(rootDir, 'packages/plugin-kubectl/src/matchers.ts')).text();

describe('workspace publish scripts', () => {
  test('publish scripts use bun publish for workspace protocol rewriting', () => {
    expect(typeof rootPackageJson.scripts['publish:repterm']).toBe('string');
    expect(typeof rootPackageJson.scripts['publish:plugin-api']).toBe('string');
    expect(typeof rootPackageJson.scripts['publish:plugin-kubectl']).toBe('string');
    expect(rootPackageJson.scripts['publish:repterm']).toContain('bun publish');
    expect(rootPackageJson.scripts['publish:plugin-api']).toContain('bun publish');
    expect(rootPackageJson.scripts['publish:plugin-kubectl']).toContain('bun publish');
    expect(rootPackageJson.scripts['publish:plugins']).not.toContain('npm publish --workspace');
  });

  test('workspace package names and imports use the new npm identities', () => {
    expect(pluginApiPackageJson.name).toBe('repterm-api');
    expect(pluginKubectlPackageJson.name).toBe('@nexusgpu/repterm-plugin-kubectl');

    expect(reptermPackageJson.dependencies['repterm-api']).toBe('workspace:*');
    expect(pluginKubectlPackageJson.dependencies['repterm-api']).toBe('workspace:*');

    expect(reptermExpectFile).toContain("from 'repterm-api'");
    expect(reptermPluginFile).toContain("from 'repterm-api'");
    expect(kubectlIndexFile).toContain("from 'repterm-api'");
    expect(kubectlMatchersFile).toContain("from 'repterm-api'");
  });
});
