import { run, runSafe, commandExists } from './exec.js';
import { readFile, readdir, writeFile } from 'fs/promises';
import { createServer } from 'net';
import type {
  ServiceStatus, SystemdUnit, GmailServiceInfo,
  TunnelInfo, HooksProxyInfo, GCloudProject,
} from '../types.js';

export { commandExists };

// ─── OS Detection ────────────────────────────────────────────

export function isLinux(): boolean {
  return process.platform === 'linux';
}

export function isRoot(): boolean {
  return process.getuid?.() === 0;
}

export async function getOS(): Promise<string> {
  try {
    const { stdout } = await run('lsb_release', ['-si']);
    return stdout.trim().toLowerCase();
  } catch {
    try {
      const content = await readFile('/etc/os-release', 'utf8');
      const match = content.match(/^ID=(.+)$/m);
      return match ? match[1].replace(/"/g, '').toLowerCase() : 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

export async function isDebianBased(): Promise<boolean> {
  const os = await getOS();
  return ['ubuntu', 'debian'].includes(os);
}

// ─── Command Checks ──────────────────────────────────────────

export async function getVersion(cmd: string, versionFlag = '--version'): Promise<string | null> {
  const result = await runSafe(cmd, [versionFlag]);
  if (!result) return null;
  const match = (result.stdout || result.stderr).match(/\d+\.\d+[\.\d]*/);
  return match ? match[0] : null;
}

export async function checkCommands(cmds: string[]): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  await Promise.all(
    cmds.map(async (cmd) => {
      results[cmd] = await commandExists(cmd);
    })
  );
  return results;
}

// ─── Port Utilities ──────────────────────────────────────────

export async function getUsedPorts(): Promise<Set<number>> {
  const result = await runSafe('ss', ['-tlnp']);
  if (!result) return new Set();
  const ports = new Set<number>();
  const matches = result.stdout.matchAll(/:(\d+)\s/g);
  for (const m of matches) ports.add(Number(m[1]));
  return ports;
}

export async function findNextPort(startPort = 8788): Promise<number> {
  const used = await getUsedPorts();
  let port = startPort;
  while (used.has(port)) port++;
  return port;
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
    srv.on('error', () => resolve(false));
  });
}

// ─── Service Detection ───────────────────────────────────────

export async function getServiceStatus(name: string): Promise<ServiceStatus> {
  const result = await runSafe('systemctl', ['is-active', name]);
  if (!result) return 'unknown';
  return result.stdout.trim() as ServiceStatus;
}

export async function isServiceRunning(name: string): Promise<boolean> {
  return (await getServiceStatus(name)) === 'active';
}

export async function listSystemdServices(pattern?: string): Promise<SystemdUnit[]> {
  const result = await runSafe('systemctl', ['list-units', '--type=service', '--no-pager', '-o', 'json']);
  if (!result) return [];
  try {
    const units = JSON.parse(result.stdout) as Array<{ unit: string; active: string }>;
    return units
      .filter((u) => !pattern || u.unit.includes(pattern))
      .map((u) => ({ name: u.unit, active: u.active === 'active' }));
  } catch {
    // Fallback: parse text output
    const r = await runSafe('systemctl', ['list-units', '--type=service', '--no-pager']);
    if (!r) return [];
    return r.stdout
      .split('\n')
      .filter((l) => !pattern || l.includes(pattern))
      .map((l) => {
        const parts = l.trim().split(/\s+/);
        return { name: parts[0], active: parts[2] === 'active' };
      })
      .filter((s) => s.name);
  }
}

// ─── Systemd Helpers ─────────────────────────────────────────

export async function readSystemdService(name: string): Promise<string | null> {
  try {
    const content = await readFile(`/etc/systemd/system/${name}`, 'utf8');
    return content;
  } catch {
    return null;
  }
}

export async function writeSystemdService(name: string, content: string): Promise<void> {
  await writeFile(`/etc/systemd/system/${name}`, content, 'utf8');
  await run('systemctl', ['daemon-reload']);
}

export async function enableAndStartService(name: string): Promise<void> {
  await run('systemctl', ['enable', name]);
  await run('systemctl', ['start', name]);
}

export async function restartService(name: string): Promise<void> {
  await run('systemctl', ['restart', name]);
}

// ─── Gmail Services Detection ────────────────────────────────

export async function detectGmailServices(): Promise<string[]> {
  try {
    const files = await readdir('/etc/systemd/system');
    return files.filter((f) => f.startsWith('gmail-watch-') && f.endsWith('.service'));
  } catch {
    return [];
  }
}

export async function parseGmailServiceInfo(serviceFile: string): Promise<GmailServiceInfo | null> {
  const content = await readSystemdService(serviceFile);
  if (!content) return null;

  const accountMatch = content.match(/--account\s+(\S+)/);
  const portMatch = content.match(/--port\s+(\d+)/);
  const hookNameMatch = content.match(/--hook-url\s+\S+\/hooks\/(\S+)/);
  const topicMatch = content.match(/--topic\s+(\S+)/);
  const subscriptionMatch = content.match(/--subscription\s+(\S+)/);

  return {
    serviceName: serviceFile.replace('.service', ''),
    account: accountMatch?.[1] ?? null,
    port: portMatch ? Number(portMatch[1]) : null,
    hookName: hookNameMatch?.[1] ?? null,
    topic: topicMatch?.[1] ?? null,
    subscription: subscriptionMatch?.[1] ?? null,
  };
}

// ─── Cloudflare Detection ────────────────────────────────────

export async function detectCloudflaredToken(): Promise<string | null> {
  const content = await readSystemdService('cloudflared.service');
  if (!content) return null;
  const match = content.match(/--token\s+(\S+)/);
  return match ? match[1] : null;
}

export function parseTunnelToken(token: string): TunnelInfo | null {
  try {
    const payload = Buffer.from(token, 'base64').toString('utf8');
    const parsed = JSON.parse(payload) as { a: string; t: string };
    return {
      accountId: parsed.a,
      tunnelId: parsed.t,
    };
  } catch {
    return null;
  }
}

// ─── Hooks Proxy Detection ───────────────────────────────────

export async function detectHooksProxyInfo(): Promise<HooksProxyInfo | null> {
  const content = await readSystemdService('openclaw-hooks-proxy.service');
  if (!content) return null;

  const tokenMatch = content.match(/OPENCLAW_HOOK_TOKEN=(\S+)/);
  const portMatch = content.match(/PORT=(\d+)/);

  return {
    token: tokenMatch?.[1] ?? null,
    port: portMatch ? Number(portMatch[1]) : 18800,
  };
}

// ─── gcloud helpers ──────────────────────────────────────────

export async function gcloudListProjects(): Promise<GCloudProject[]> {
  const result = await runSafe('gcloud', ['projects', 'list', '--format=json']);
  if (!result?.stdout) return [];
  try {
    const raw = JSON.parse(result.stdout) as Array<{ projectId: string; name: string }>;
    return raw.map((p) => ({ id: p.projectId, name: p.name }));
  } catch {
    return [];
  }
}

export async function gcloudGetCurrentProject(): Promise<string | null> {
  const result = await runSafe('gcloud', ['config', 'get-value', 'project']);
  return result?.stdout?.trim() || null;
}

export async function gcloudIsAuthenticated(): Promise<boolean> {
  const result = await runSafe('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']);
  return !!(result?.stdout?.trim());
}

export async function gcloudGetActiveAccount(): Promise<string | null> {
  const result = await runSafe('gcloud', ['config', 'get-value', 'account']);
  return result?.stdout?.trim() || null;
}

// ─── Network ─────────────────────────────────────────────────

export async function getPublicIP(): Promise<string | null> {
  const result = await runSafe('curl', ['-s', '--max-time', '5', 'https://api.ipify.org']);
  return result?.stdout?.trim() || null;
}
