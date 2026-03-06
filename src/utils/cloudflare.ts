import { readCliConfig, getCliConfigValue, setCliConfigValue } from './config.js';
import { detectCloudflaredToken, parseTunnelToken } from './system.js';
import { runSafe } from './exec.js';
import type { CloudflareConfig, TunnelInfo, IngressRule, TunnelApiConfig } from '../types.js';

const CF_API = 'https://api.cloudflare.com/client/v4';

// ─── Config ──────────────────────────────────────────────────

export async function getCloudflareConfig(): Promise<CloudflareConfig> {
  const config = await readCliConfig();
  return (config.cloudflare as CloudflareConfig) || {};
}

export async function saveCloudflareConfig(cfg: CloudflareConfig): Promise<void> {
  await setCliConfigValue('cloudflare', cfg);
}

/**
 * Auto-detect cloudflare tunnel info from the running cloudflared service.
 * Returns { accountId, tunnelId } or null.
 */
export async function detectTunnelInfo(): Promise<TunnelInfo | null> {
  const token = await detectCloudflaredToken();
  if (!token) return null;
  return parseTunnelToken(token);
}

// ─── API Calls ───────────────────────────────────────────────

interface CfFetchOptions {
  method?: string;
  body?: unknown;
}

interface CfApiResponse {
  success: boolean;
  errors?: Array<{ message: string }>;
  result?: unknown;
}

async function cfFetch(path: string, opts: CfFetchOptions = {}): Promise<unknown> {
  const apiToken = await getCliConfigValue('cloudflare.apiToken');
  if (!apiToken) throw new Error('Cloudflare API token not configured. Run: openclawpro add cloudflare');

  const url = `${CF_API}${path}`;

  const result = await runSafe('curl', [
    '-s',
    '-X', opts.method || 'GET',
    '-H', `Authorization: Bearer ${apiToken}`,
    '-H', 'Content-Type: application/json',
    ...(opts.body ? ['-d', JSON.stringify(opts.body)] : []),
    url,
  ]);

  if (!result) throw new Error(`Cloudflare API request failed: ${path}`);

  try {
    const data = JSON.parse(result.stdout) as CfApiResponse;
    if (!data.success) {
      const errors = (data.errors || []).map((e) => e.message).join(', ');
      throw new Error(`Cloudflare API error: ${errors}`);
    }
    return data.result;
  } catch (e) {
    if ((e as Error).message.startsWith('Cloudflare API error')) throw e;
    throw new Error(`Failed to parse Cloudflare API response: ${result.stdout?.slice(0, 200)}`);
  }
}

/**
 * Get current tunnel ingress configuration.
 */
export async function getTunnelConfig(accountId: string, tunnelId: string): Promise<TunnelApiConfig> {
  return cfFetch(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`) as Promise<TunnelApiConfig>;
}

/**
 * Update tunnel ingress configuration.
 * ingressRules: array of { hostname, service } objects.
 * Always appends a catch-all rule { service: 'http_status:404' }.
 */
export async function updateTunnelIngress(
  accountId: string,
  tunnelId: string,
  ingressRules: IngressRule[]
): Promise<unknown> {
  const rules = ingressRules.filter((r) => r.service !== 'http_status:404');
  rules.push({ service: 'http_status:404' });

  return cfFetch(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: 'PUT',
    body: {
      config: { ingress: rules },
    },
  });
}

/**
 * Add a hostname route to the cloudflare tunnel.
 * Reads existing config, adds the new rule, and updates.
 */
export async function addTunnelHostname(hostname: string, serviceUrl: string): Promise<void> {
  const cfg = await getCloudflareConfig();
  const { accountId, tunnelId } = cfg;

  if (!accountId || !tunnelId) {
    throw new Error('Cloudflare tunnel info not configured. Run: openclawpro add cloudflare');
  }

  const current = await getTunnelConfig(accountId, tunnelId);
  const existing = (current?.config?.ingress || []).filter(
    (r) => r.service !== 'http_status:404' && r.hostname !== hostname
  );

  existing.unshift({ hostname, service: serviceUrl });
  await updateTunnelIngress(accountId, tunnelId, existing);
}

/**
 * List all configured hostnames for the tunnel.
 */
export async function listTunnelHostnames(): Promise<IngressRule[]> {
  const cfg = await getCloudflareConfig();
  const { accountId, tunnelId } = cfg;
  if (!accountId || !tunnelId) return [];

  try {
    const current = await getTunnelConfig(accountId, tunnelId);
    return (current?.config?.ingress || []).filter((r) => r.hostname);
  } catch {
    return [];
  }
}

/**
 * Find the hooks domain from the tunnel config (looks for port 18800).
 */
export async function detectHooksDomain(): Promise<string | null> {
  const stored = await getCliConfigValue('hooksDomain');
  if (stored) return stored as string;

  try {
    const hostnames = await listTunnelHostnames();
    const hooksRoute = hostnames.find(
      (r) => r.service?.includes('18800') || r.service?.includes('hooks')
    );
    if (hooksRoute?.hostname) {
      await setCliConfigValue('hooksDomain', hooksRoute.hostname);
      return hooksRoute.hostname;
    }
  } catch {}

  return null;
}

/**
 * Create a DNS CNAME record for a new tunnel hostname.
 */
export async function createDnsCname(zoneId: string, hostname: string, tunnelId: string): Promise<unknown> {
  return cfFetch(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: {
      type: 'CNAME',
      name: hostname,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      ttl: 1,
    },
  });
}

/**
 * List zones for the account.
 */
export async function listZones(): Promise<unknown> {
  return cfFetch('/zones');
}

// ─── Setup helpers ───────────────────────────────────────────

/**
 * Initialize cloudflare config from the running cloudflared service.
 * Returns the config object.
 */
export async function initCloudflareConfig(apiToken: string): Promise<CloudflareConfig> {
  const tunnelInfo = await detectTunnelInfo();

  const cfg: CloudflareConfig = {
    apiToken,
    accountId: tunnelInfo?.accountId ?? null,
    tunnelId: tunnelInfo?.tunnelId ?? null,
  };

  await saveCloudflareConfig(cfg);
  return cfg;
}
