import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import type { OpenClawConfig, HookMapping, CliConfig, ProxyRoutes, ProxyRouteConfig } from '../types.js';

const OPENCLAW_DIR = join(homedir(), '.openclaw');
const OPENCLAW_JSON = join(OPENCLAW_DIR, 'openclaw.json');
const HOOKS_PROXY_PATH = join(OPENCLAW_DIR, 'hooks-proxy.mjs');
const GOGCLI_DIR = join(OPENCLAW_DIR, 'gogcli');
const CLI_CONFIG_DIR = join(homedir(), '.openclawpro');
const CLI_CONFIG_PATH = join(CLI_CONFIG_DIR, 'config.json');

export { OPENCLAW_JSON, HOOKS_PROXY_PATH, OPENCLAW_DIR, GOGCLI_DIR, CLI_CONFIG_DIR };

// ─── OpenClaw Config ────────────────────────────────────────

export async function readOpenClawConfig(): Promise<OpenClawConfig | null> {
  try {
    const raw = await readFile(OPENCLAW_JSON, 'utf8');
    return JSON.parse(raw) as OpenClawConfig;
  } catch {
    return null;
  }
}

export async function writeOpenClawConfig(config: OpenClawConfig): Promise<void> {
  config.meta = {
    ...config.meta,
    lastTouchedAt: new Date().toISOString(),
  };
  await writeFile(OPENCLAW_JSON, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export async function getHookToken(): Promise<string | null> {
  const config = await readOpenClawConfig();
  return config?.hooks?.token ?? null;
}

export async function getGatewayPort(): Promise<number> {
  const config = await readOpenClawConfig();
  return config?.gateway?.port ?? 18789;
}

export async function getHooksProxyPort(): Promise<number> {
  try {
    const serviceContent = await readFile(
      '/etc/systemd/system/openclaw-hooks-proxy.service',
      'utf8'
    );
    const match = serviceContent.match(/PORT=(\d+)/);
    if (match) return Number(match[1]);
  } catch {}
  return 18800;
}

// ─── Hook Mapping Management ───────────────────────────────

/**
 * Add a hook mapping to openclaw.json hooks.mappings array.
 * Replaces existing mapping with same path match if present.
 */
export async function addHookMapping(mapping: HookMapping): Promise<void> {
  const config = await readOpenClawConfig();
  if (!config) throw new Error('openclaw.json not found');

  if (!config.hooks) config.hooks = {};
  if (!config.hooks.mappings) config.hooks.mappings = [];

  const pathKey = mapping.match?.path;
  const idx = config.hooks.mappings.findIndex((m) => m.match?.path === pathKey);
  if (idx >= 0) {
    config.hooks.mappings[idx] = mapping;
  } else {
    config.hooks.mappings.push(mapping);
  }

  await writeOpenClawConfig(config);
}

/**
 * Set the gmail section in openclaw.json hooks.gmail.
 */
export async function setGmailConfig(gmailConfig: { account?: string }): Promise<void> {
  const config = await readOpenClawConfig();
  if (!config) throw new Error('openclaw.json not found');
  if (!config.hooks) config.hooks = {};
  config.hooks.gmail = gmailConfig;
  await writeOpenClawConfig(config);
}

// ─── CLI Config ─────────────────────────────────────────────

export async function readCliConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(CLI_CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export async function writeCliConfig(config: CliConfig): Promise<void> {
  await mkdir(CLI_CONFIG_DIR, { recursive: true });
  await writeFile(CLI_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export async function getCliConfigValue(key: string): Promise<unknown> {
  const config = await readCliConfig();
  return key.split('.').reduce<unknown>((obj, k) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
    return undefined;
  }, config);
}

export async function setCliConfigValue(key: string, value: unknown): Promise<void> {
  const config = await readCliConfig();
  const parts = key.split('.');
  let obj: Record<string, unknown> = config as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]] as Record<string, unknown>;
  }
  obj[parts[parts.length - 1]] = value;
  await writeCliConfig(config);
}

// ─── Hooks Proxy Management ──────────────────────────────────

/**
 * Read current ROUTES from hooks-proxy.mjs using regex extraction.
 * Returns the routes object or an empty object.
 */
export async function readProxyRoutes(): Promise<ProxyRoutes> {
  // First try our CLI config (source of truth)
  const cliConfig = await readCliConfig();
  if (cliConfig.proxyRoutes) return cliConfig.proxyRoutes;

  // Try to parse existing hooks-proxy.mjs
  try {
    const content = await readFile(HOOKS_PROXY_PATH, 'utf8');
    const match = content.match(/const ROUTES\s*=\s*(\{[\s\S]*?\n\})/m);
    if (match) {
      const routesBlock = match[1]
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');

      const routes: ProxyRoutes = {};
      const routePattern = /"([^"]+)"\s*:\s*\{([^}]+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = routePattern.exec(routesBlock)) !== null) {
        const path = m[1];
        const body = m[2];
        const entry: ProxyRouteConfig = {};
        const secretMatch = body.match(/secret\s*:\s*"([^"]+)"/);
        const secretFieldMatch = body.match(/secretField\s*:\s*"([^"]+)"/);
        const secretHeaderMatch = body.match(/secretHeader\s*:\s*"([^"]+)"/);
        const upstreamMatch = body.match(/upstream\s*:\s*"([^"]+)"/);
        if (secretMatch) entry.secret = secretMatch[1];
        if (secretFieldMatch) entry.secretField = secretFieldMatch[1];
        if (secretHeaderMatch) entry.secretHeader = secretHeaderMatch[1];
        if (upstreamMatch) entry.upstream = upstreamMatch[1];
        routes[path] = entry;
      }
      return routes;
    }
  } catch {}

  return {};
}

/**
 * Save routes to CLI config and regenerate hooks-proxy.mjs.
 */
export async function writeProxyRoutes(routes: ProxyRoutes): Promise<void> {
  await setCliConfigValue('proxyRoutes', routes);
  await regenerateHooksProxy(routes);
}

/**
 * Add or update a route in the hooks proxy.
 */
export async function addProxyRoute(path: string, config: ProxyRouteConfig): Promise<void> {
  const routes = await readProxyRoutes();
  routes[path] = config;
  await writeProxyRoutes(routes);
}

/**
 * Regenerate hooks-proxy.mjs from routes.
 */
export async function regenerateHooksProxy(routes: ProxyRoutes): Promise<void> {
  const thisFile = fileURLToPath(import.meta.url);
  const templatePath = join(dirname(thisFile), '..', '..', 'templates', 'hooks-proxy.mjs');

  let template: string;
  try {
    template = await readFile(templatePath, 'utf8');
  } catch {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const routesJs = formatRoutesAsJs(routes);
  const content = template.replace('// __ROUTES__', routesJs);
  await writeFile(HOOKS_PROXY_PATH, content, 'utf8');
}

function formatRoutesAsJs(routes: ProxyRoutes): string {
  const lines: string[] = [];
  for (const [path, cfg] of Object.entries(routes)) {
    const parts: string[] = [];
    if (cfg.upstream) {
      parts.push(`    upstream: ${JSON.stringify(cfg.upstream)}`);
    }
    if (cfg.secret) {
      parts.push(`    secret: ${JSON.stringify(cfg.secret)}`);
    }
    if (cfg.secretField) {
      parts.push(`    secretField: ${JSON.stringify(cfg.secretField)}`);
    }
    if (cfg.secretHeader) {
      parts.push(`    secretHeader: ${JSON.stringify(cfg.secretHeader)}`);
    }
    lines.push(`  ${JSON.stringify(path)}: {\n${parts.join(',\n')},\n  }`);
  }
  return lines.join(',\n');
}

// ─── Helpers ────────────────────────────────────────────────

export function generateToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
