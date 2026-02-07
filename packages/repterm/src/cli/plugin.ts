import { access, readFile } from 'fs/promises';
import { constants } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { parseArgs } from 'util';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;

export interface ParsedNpmrc {
  registry?: string;
  authTokens: Record<string, string>;
}

export interface RegistryConfig {
  registry: string;
  token?: string;
}

export interface PluginSearchPackage {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  links?: {
    npm?: string;
  };
}

export interface InstalledPluginInfo {
  name: string;
  requestedVersion: string;
  section: 'dependencies' | 'devDependencies' | 'optionalDependencies';
  installedVersion?: string;
}

interface BunRunOptions {
  cwd: string;
  captureOutput?: boolean;
}

interface BunRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface PluginCommandDeps {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  fileExists: (filePath: string) => Promise<boolean>;
  readFileText: (filePath: string) => Promise<string>;
  fetchJson: (url: string, headers?: Record<string, string>) => Promise<unknown>;
  runBun: (args: string[], options: BunRunOptions) => Promise<BunRunResult>;
}

interface PackageSpec {
  name: string;
  version?: string;
}

interface PackageManifest {
  version?: string;
  keywords?: unknown;
  reptermPlugin?: unknown;
  peerDependencies?: Record<string, string>;
}

function normalizeRegistryUrl(registry: string): string {
  const trimmed = registry.trim();
  if (trimmed.length === 0) {
    return DEFAULT_REGISTRY;
  }

  if (trimmed.endsWith('/')) {
    return trimmed;
  }

  return `${trimmed}/`;
}

function registryKeyFromUrl(registry: string): string[] {
  try {
    const url = new URL(registry);
    const normalizedPath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    const fullPathKey = `//${url.host}${normalizedPath}`;
    const hostKey = `//${url.host}/`;

    if (fullPathKey === hostKey) {
      return [hostKey];
    }

    return [fullPathKey, hostKey];
  } catch {
    return [];
  }
}

function normalizeTokenKey(key: string): string {
  const trimmed = key.trim();

  if (trimmed.startsWith('//')) {
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const keys = registryKeyFromUrl(trimmed);
    return keys.length > 0 ? keys[0] : trimmed;
  }

  return trimmed;
}

function expandEnvVariables(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, variable: string) => env[variable] ?? '');
}

export function parseNpmrc(content: string, env: NodeJS.ProcessEnv = process.env): ParsedNpmrc {
  const parsed: ParsedNpmrc = {
    authTokens: {},
  };

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const rawKey = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = expandEnvVariables(rawValue, env);

    if (rawKey === 'registry') {
      parsed.registry = normalizeRegistryUrl(value);
      continue;
    }

    if (rawKey.endsWith(':_authToken')) {
      const tokenKey = normalizeTokenKey(rawKey.slice(0, -':_authToken'.length));
      if (tokenKey.length > 0 && value.length > 0) {
        parsed.authTokens[tokenKey] = value;
      }
    }
  }

  return parsed;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readUtf8(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Registry request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function readableStreamToText(
  stream: number | ReadableStream<Uint8Array> | undefined | null
): Promise<string> {
  if (stream === undefined || stream === null || typeof stream === 'number') {
    return '';
  }

  return new Response(stream).text();
}

async function runBun(args: string[], options: BunRunOptions): Promise<BunRunResult> {
  let proc: ReturnType<typeof Bun.spawn>;

  try {
    proc = Bun.spawn(['bun', ...args], {
      cwd: options.cwd,
      stdout: options.captureOutput ? 'pipe' : 'inherit',
      stderr: options.captureOutput ? 'pipe' : 'inherit',
      stdin: 'ignore',
    });
  } catch (error) {
    throw new Error(`Failed to execute bun: ${(error as Error).message}`);
  }

  const exitCode = await proc.exited;

  if (!options.captureOutput) {
    return {
      exitCode,
      stdout: '',
      stderr: '',
    };
  }

  const stdout = await readableStreamToText(proc.stdout);
  const stderr = await readableStreamToText(proc.stderr);

  return {
    exitCode,
    stdout,
    stderr,
  };
}

function createDefaultDeps(): PluginCommandDeps {
  return {
    cwd: process.cwd(),
    env: process.env,
    stdout: console.log,
    stderr: console.error,
    fileExists: pathExists,
    readFileText: readUtf8,
    fetchJson,
    runBun,
  };
}

export async function findProjectRoot(
  startDir: string,
  fileExistsFn: (filePath: string) => Promise<boolean> = pathExists
): Promise<string | null> {
  let currentDir = resolve(startDir);

  while (true) {
    if (await fileExistsFn(join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parent = dirname(currentDir);
    if (parent === currentDir) {
      return null;
    }

    currentDir = parent;
  }
}

async function readNpmrc(filePath: string, deps: PluginCommandDeps): Promise<ParsedNpmrc> {
  if (!(await deps.fileExists(filePath))) {
    return { authTokens: {} };
  }

  const content = await deps.readFileText(filePath);
  return parseNpmrc(content, deps.env);
}

function selectAuthToken(registry: string, configs: ParsedNpmrc[], env: NodeJS.ProcessEnv): string | undefined {
  const lookupKeys = registryKeyFromUrl(registry);

  for (const config of configs) {
    for (const key of lookupKeys) {
      const token = config.authTokens[key];
      if (token) {
        return token;
      }
    }
  }

  if (env.NPM_TOKEN && env.NPM_TOKEN.trim().length > 0) {
    return env.NPM_TOKEN.trim();
  }

  return undefined;
}

export async function resolveRegistryConfig(cwd: string, deps: PluginCommandDeps): Promise<RegistryConfig> {
  const projectRoot = await findProjectRoot(cwd, deps.fileExists);
  const projectNpmrcPath = projectRoot ? join(projectRoot, '.npmrc') : join(cwd, '.npmrc');
  const userNpmrcPath = join(homedir(), '.npmrc');

  const projectConfig = await readNpmrc(projectNpmrcPath, deps);
  const userConfig = await readNpmrc(userNpmrcPath, deps);

  const envRegistry = deps.env.NPM_CONFIG_REGISTRY ?? deps.env.npm_config_registry;
  const registry = normalizeRegistryUrl(
    envRegistry ?? projectConfig.registry ?? userConfig.registry ?? DEFAULT_REGISTRY
  );

  const token = selectAuthToken(registry, [projectConfig, userConfig], deps.env);

  return {
    registry,
    token,
  };
}

export function parsePackageSpec(spec: string): PackageSpec {
  const trimmed = spec.trim();
  if (trimmed.length === 0) {
    throw new Error('Package spec cannot be empty');
  }

  if (trimmed.startsWith('@')) {
    const versionSeparator = trimmed.indexOf('@', 1);
    if (versionSeparator === -1) {
      return { name: trimmed };
    }

    return {
      name: trimmed.slice(0, versionSeparator),
      version: trimmed.slice(versionSeparator + 1) || undefined,
    };
  }

  const versionSeparator = trimmed.indexOf('@');
  if (versionSeparator === -1) {
    return { name: trimmed };
  }

  return {
    name: trimmed.slice(0, versionSeparator),
    version: trimmed.slice(versionSeparator + 1) || undefined,
  };
}

function normalizeKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) {
    return [];
  }

  return keywords
    .filter((keyword): keyword is string => typeof keyword === 'string')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 0);
}

export function isReptermPluginPackage(
  packageName: string,
  keywords: unknown,
  reptermPluginField: unknown,
  peerDependencies: unknown = undefined
): boolean {
  const normalizedName = packageName.toLowerCase();

  if (normalizedName.includes('repterm-plugin')) {
    return true;
  }

  if (reptermPluginField !== undefined) {
    return true;
  }

  const normalizedKeywords = normalizeKeywords(keywords);
  const hasPluginKeywords =
    normalizedKeywords.includes('repterm') && normalizedKeywords.includes('plugin');

  if (!hasPluginKeywords) {
    return false;
  }

  if (!peerDependencies || typeof peerDependencies !== 'object') {
    return false;
  }

  return typeof (peerDependencies as Record<string, unknown>).repterm === 'string';
}

export function extractPluginSearchResults(payload: unknown): PluginSearchPackage[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const objects = (payload as { objects?: unknown }).objects;
  if (!Array.isArray(objects)) {
    return [];
  }

  const results: PluginSearchPackage[] = [];

  for (const entry of objects) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const pkg = (entry as { package?: unknown }).package;
    if (!pkg || typeof pkg !== 'object') {
      continue;
    }

    const candidate = pkg as {
      name?: unknown;
      version?: unknown;
      description?: unknown;
      keywords?: unknown;
      links?: unknown;
      reptermPlugin?: unknown;
    };

    if (typeof candidate.name !== 'string' || typeof candidate.version !== 'string') {
      continue;
    }

    if (!isReptermPluginPackage(candidate.name, candidate.keywords, candidate.reptermPlugin)) {
      continue;
    }

    const links = candidate.links;
    const npmLink =
      links && typeof links === 'object' && typeof (links as { npm?: unknown }).npm === 'string'
        ? (links as { npm: string }).npm
        : undefined;

    results.push({
      name: candidate.name,
      version: candidate.version,
      description: typeof candidate.description === 'string' ? candidate.description : '',
      keywords: normalizeKeywords(candidate.keywords),
      links: npmLink ? { npm: npmLink } : undefined,
    });
  }

  return results;
}

async function readJsonFile<T>(filePath: string, deps: PluginCommandDeps): Promise<T | null> {
  if (!(await deps.fileExists(filePath))) {
    return null;
  }

  try {
    const content = await deps.readFileText(filePath);
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function joinRegistryPath(registry: string, relativePath: string): string {
  const normalized = normalizeRegistryUrl(registry);
  const trimmedPath = relativePath.replace(/^\/+/, '');
  return `${normalized}${trimmedPath}`;
}

async function fetchLatestPackageManifest(
  packageName: string,
  registryConfig: RegistryConfig,
  deps: PluginCommandDeps
): Promise<PackageManifest | null> {
  const encodedName = encodeURIComponent(packageName);
  const endpoint = joinRegistryPath(registryConfig.registry, `${encodedName}/latest`);

  const headers: Record<string, string> = {};
  if (registryConfig.token) {
    headers.authorization = `Bearer ${registryConfig.token}`;
  }

  try {
    const payload = await deps.fetchJson(endpoint, headers);
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    return payload as PackageManifest;
  } catch {
    return null;
  }
}

function toNodeModulesPackagePath(projectRoot: string, packageName: string): string {
  const segments = packageName.split('/');
  return join(projectRoot, 'node_modules', ...segments, 'package.json');
}

export async function listInstalledReptermPlugins(
  projectRoot: string,
  deps: Pick<PluginCommandDeps, 'readFileText' | 'fileExists'>
): Promise<InstalledPluginInfo[]> {
  const projectPackageJson = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  }>(join(projectRoot, 'package.json'), deps as PluginCommandDeps);

  if (!projectPackageJson) {
    return [];
  }

  const dependencySections: Array<{
    section: InstalledPluginInfo['section'];
    entries: Record<string, string> | undefined;
  }> = [
    { section: 'dependencies', entries: projectPackageJson.dependencies },
    { section: 'devDependencies', entries: projectPackageJson.devDependencies },
    { section: 'optionalDependencies', entries: projectPackageJson.optionalDependencies },
  ];

  const plugins: InstalledPluginInfo[] = [];

  for (const { section, entries } of dependencySections) {
    if (!entries) {
      continue;
    }

    for (const [name, requestedVersion] of Object.entries(entries)) {
      const installedManifest = await readJsonFile<PackageManifest>(
        toNodeModulesPackagePath(projectRoot, name),
        deps as PluginCommandDeps
      );

      if (!isReptermPluginPackage(name, installedManifest?.keywords, installedManifest?.reptermPlugin, installedManifest?.peerDependencies)) {
        continue;
      }

      plugins.push({
        name,
        requestedVersion,
        section,
        installedVersion: installedManifest?.version,
      });
    }
  }

  plugins.sort((left, right) => left.name.localeCompare(right.name));
  return plugins;
}

function validateSearchLimit(rawLimit: string | undefined): number {
  if (!rawLimit) {
    return DEFAULT_SEARCH_LIMIT;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('--limit must be a positive integer');
  }

  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

function printPluginHelp(stdout: (message: string) => void): void {
  stdout(`
Repterm Plugin Manager (Bun-only)

Usage:
  repterm plugin <command> [options]

Commands:
  search [query]            Search registry plugins (keywords: repterm + plugin)
  list                       List installed repterm plugins in current project
  install <pkg...>           Install one or more plugins with bun add -d
  uninstall <pkg...>         Remove plugins with bun remove
  update [pkg...]            Update plugins with bun update
  help                       Show this help message

Examples:
  repterm plugin search kubernetes
  repterm plugin install @nexusgpu/repterm-plugin-kubectl
  repterm plugin list
  repterm plugin update
`);
}

function buildSearchText(query: string): string {
  const normalizedQuery = query.trim();
  return normalizedQuery.length > 0
    ? `keywords:repterm keywords:plugin ${normalizedQuery}`
    : 'keywords:repterm keywords:plugin';
}

function parseBool(value: unknown): boolean {
  return typeof value === 'boolean' && value;
}

function parsePackageSpecs(positionals: string[]): PackageSpec[] {
  return positionals.map((spec) => parsePackageSpec(spec));
}

async function verifyImportability(
  packageNames: string[],
  projectRoot: string,
  deps: PluginCommandDeps
): Promise<boolean> {
  for (const packageName of packageNames) {
    const script = `await import(${JSON.stringify(packageName)});`;
    const result = await deps.runBun(['-e', script], {
      cwd: projectRoot,
      captureOutput: true,
    });

    if (result.exitCode !== 0) {
      deps.stderr(`Failed to import plugin ${packageName}.`);
      if (result.stderr.trim().length > 0) {
        deps.stderr(result.stderr.trim());
      }
      return false;
    }
  }

  return true;
}

async function requireProjectRoot(deps: PluginCommandDeps): Promise<string> {
  const root = await findProjectRoot(deps.cwd, deps.fileExists);
  if (!root) {
    throw new Error('No package.json found from current directory upwards. Run this command in your project.');
  }
  return root;
}

function isValidRegistryPackageName(packageName: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(packageName);
}

async function validatePluginPackagesOrThrow(
  packageNames: string[],
  registryConfig: RegistryConfig,
  deps: PluginCommandDeps,
  force: boolean
): Promise<void> {
  if (force) {
    return;
  }

  const nonPluginPackages: string[] = [];

  for (const packageName of packageNames) {
    if (!isValidRegistryPackageName(packageName)) {
      nonPluginPackages.push(packageName);
      continue;
    }

    const manifest = await fetchLatestPackageManifest(packageName, registryConfig, deps);
    if (!manifest) {
      nonPluginPackages.push(packageName);
      continue;
    }

    if (!isReptermPluginPackage(packageName, manifest.keywords, manifest.reptermPlugin, manifest.peerDependencies)) {
      nonPluginPackages.push(packageName);
    }
  }

  if (nonPluginPackages.length > 0) {
    throw new Error(
      `Refusing non-repterm plugin package(s): ${nonPluginPackages.join(', ')}. ` +
        'Use --force to bypass validation.'
    );
  }
}

async function handleSearch(subArgs: string[], deps: PluginCommandDeps): Promise<number> {
  const parsed = parseArgs({
    args: subArgs,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      limit: { type: 'string', short: 'l' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  if (parseBool(parsed.values.help)) {
    deps.stdout('Usage: repterm plugin search [query] [--limit <n>] [--json]');
    return 0;
  }

  const limit = validateSearchLimit(parsed.values.limit);
  const query = parsed.positionals.join(' ').trim();
  const registryConfig = await resolveRegistryConfig(deps.cwd, deps);

  const searchText = buildSearchText(query);
  const endpoint = joinRegistryPath(
    registryConfig.registry,
    `-/v1/search?text=${encodeURIComponent(searchText)}&size=${limit}`
  );

  const headers: Record<string, string> = {};
  if (registryConfig.token) {
    headers.authorization = `Bearer ${registryConfig.token}`;
  }

  const payload = await deps.fetchJson(endpoint, headers);
  const plugins = extractPluginSearchResults(payload);

  if (parseBool(parsed.values.json)) {
    deps.stdout(JSON.stringify(plugins, null, 2));
    return 0;
  }

  if (plugins.length === 0) {
    deps.stdout('No repterm plugins found from registry search.');
    return 0;
  }

  deps.stdout(`Found ${plugins.length} repterm plugin(s):`);
  for (const plugin of plugins) {
    const description = plugin.description.length > 0 ? ` - ${plugin.description}` : '';
    deps.stdout(`- ${plugin.name}@${plugin.version}${description}`);
  }

  return 0;
}

async function handleList(subArgs: string[], deps: PluginCommandDeps): Promise<number> {
  const parsed = parseArgs({
    args: subArgs,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  if (parseBool(parsed.values.help)) {
    deps.stdout('Usage: repterm plugin list [--json]');
    return 0;
  }

  const projectRoot = await requireProjectRoot(deps);
  const plugins = await listInstalledReptermPlugins(projectRoot, deps);

  if (parseBool(parsed.values.json)) {
    deps.stdout(JSON.stringify(plugins, null, 2));
    return 0;
  }

  if (plugins.length === 0) {
    deps.stdout(`No repterm plugins are installed in ${projectRoot}.`);
    return 0;
  }

  deps.stdout(`Installed repterm plugins in ${projectRoot}:`);
  for (const plugin of plugins) {
    const installedVersion = plugin.installedVersion ?? 'not installed';
    deps.stdout(
      `- ${plugin.name} (${plugin.section}: ${plugin.requestedVersion}, installed: ${installedVersion})`
    );
  }

  return 0;
}

async function handleInstall(subArgs: string[], deps: PluginCommandDeps): Promise<number> {
  const parsed = parseArgs({
    args: subArgs,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      force: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  if (parseBool(parsed.values.help)) {
    deps.stdout('Usage: repterm plugin install <pkg...> [--force]');
    return 0;
  }

  if (parsed.positionals.length === 0) {
    throw new Error('install requires at least one package');
  }

  const specs = parsePackageSpecs(parsed.positionals);
  const packageNames = specs.map((spec) => spec.name);
  const projectRoot = await requireProjectRoot(deps);
  const registryConfig = await resolveRegistryConfig(projectRoot, deps);

  await validatePluginPackagesOrThrow(packageNames, registryConfig, deps, parseBool(parsed.values.force));

  deps.stdout(`Installing ${parsed.positionals.join(', ')} with Bun...`);
  const installResult = await deps.runBun(['add', '-d', ...parsed.positionals], {
    cwd: projectRoot,
  });

  if (installResult.exitCode !== 0) {
    return installResult.exitCode;
  }

  const importOk = await verifyImportability(packageNames, projectRoot, deps);
  if (!importOk) {
    return 1;
  }

  deps.stdout('Plugin installation completed and import verification passed.');
  return 0;
}

async function handleUninstall(subArgs: string[], deps: PluginCommandDeps): Promise<number> {
  const parsed = parseArgs({
    args: subArgs,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });

  if (parseBool(parsed.values.help)) {
    deps.stdout('Usage: repterm plugin uninstall <pkg...>');
    return 0;
  }

  if (parsed.positionals.length === 0) {
    throw new Error('uninstall requires at least one package');
  }

  const packageNames = parsePackageSpecs(parsed.positionals).map((spec) => spec.name);
  const projectRoot = await requireProjectRoot(deps);
  const installedPlugins = await listInstalledReptermPlugins(projectRoot, deps);
  const installedPluginNames = new Set(installedPlugins.map((plugin) => plugin.name));

  const notInstalled = packageNames.filter((name) => !installedPluginNames.has(name));
  if (notInstalled.length > 0) {
    throw new Error(`Not installed as repterm plugin(s): ${notInstalled.join(', ')}`);
  }

  deps.stdout(`Uninstalling ${packageNames.join(', ')} with Bun...`);
  const result = await deps.runBun(['remove', ...packageNames], {
    cwd: projectRoot,
  });

  return result.exitCode;
}

async function handleUpdate(subArgs: string[], deps: PluginCommandDeps): Promise<number> {
  const parsed = parseArgs({
    args: subArgs,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      force: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  if (parseBool(parsed.values.help)) {
    deps.stdout('Usage: repterm plugin update [pkg...] [--force]');
    return 0;
  }

  const projectRoot = await requireProjectRoot(deps);
  const installedPlugins = await listInstalledReptermPlugins(projectRoot, deps);

  let packageNames: string[];
  if (parsed.positionals.length > 0) {
    packageNames = parsePackageSpecs(parsed.positionals).map((spec) => spec.name);
  } else {
    packageNames = installedPlugins.map((plugin) => plugin.name);
  }

  if (packageNames.length === 0) {
    deps.stdout('No repterm plugins to update.');
    return 0;
  }

  if (!parseBool(parsed.values.force)) {
    const installedPluginNames = new Set(installedPlugins.map((plugin) => plugin.name));
    const missing = packageNames.filter((name) => !installedPluginNames.has(name));
    if (missing.length > 0) {
      throw new Error(
        `Not installed as repterm plugin(s): ${missing.join(', ')}. Use --force to bypass this check.`
      );
    }
  }

  deps.stdout(`Updating ${packageNames.join(', ')} with Bun...`);
  const result = await deps.runBun(['update', ...packageNames], {
    cwd: projectRoot,
  });

  if (result.exitCode !== 0) {
    return result.exitCode;
  }

  const importOk = await verifyImportability(packageNames, projectRoot, deps);
  if (!importOk) {
    return 1;
  }

  deps.stdout('Plugin update completed and import verification passed.');
  return 0;
}

export async function runPluginCommand(
  args: string[],
  overrides: Partial<PluginCommandDeps> = {}
): Promise<number> {
  const deps = {
    ...createDefaultDeps(),
    ...overrides,
  };

  const command = args[0];
  const subArgs = args.slice(1);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printPluginHelp(deps.stdout);
    return 0;
  }

  switch (command) {
    case 'search':
      return handleSearch(subArgs, deps);
    case 'list':
      return handleList(subArgs, deps);
    case 'install':
      return handleInstall(subArgs, deps);
    case 'uninstall':
      return handleUninstall(subArgs, deps);
    case 'update':
      return handleUpdate(subArgs, deps);
    default:
      throw new Error(`Unknown plugin command: ${command}. Run 'repterm plugin help'.`);
  }
}
