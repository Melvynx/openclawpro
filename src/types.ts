// ─── Run Results ─────────────────────────────────────────────

export interface RunResult {
  stdout: string;
  stderr: string;
}

// ─── OpenClaw Config ─────────────────────────────────────────

export interface HookMapping {
  match: { path: string };
  messageTemplate: string;
  deliver: boolean;
  allowUnsafeExternalContent?: boolean;
  channel?: string;
  to?: string;
  model?: string;
  action?: string;
  wakeMode?: string;
  sessionKey?: string;
}

export interface OpenClawConfig {
  meta?: {
    lastTouchedAt?: string;
    lastTouchedVersion?: string;
  };
  gateway?: {
    port?: number;
  };
  hooks?: {
    token?: string;
    path?: string;
    mappings?: HookMapping[];
    gmail?: {
      account?: string;
    };
  };
  auth?: {
    profiles?: Record<string, unknown>;
  };
  channels?: {
    telegram?: {
      enabled?: boolean;
      groups?: Record<string, unknown>;
    };
  };
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
    };
  };
}

// ─── CLI Config ──────────────────────────────────────────────

export interface CloudflareConfig {
  apiToken?: string;
  accountId?: string | null;
  tunnelId?: string | null;
}

export interface CliConfig {
  hooksDomain?: string;
  gogKeyringPassword?: string;
  cloudflare?: CloudflareConfig;
  proxyRoutes?: ProxyRoutes;
  [key: string]: unknown;
}

// ─── Proxy Routes ────────────────────────────────────────────

export interface ProxyRouteConfig {
  upstream?: string;
  secret?: string;
  secretField?: string | null;
  secretHeader?: string | null;
}

export type ProxyRoutes = Record<string, ProxyRouteConfig>;

// ─── System ──────────────────────────────────────────────────

export type ServiceStatus = 'active' | 'inactive' | 'failed' | 'activating' | 'unknown' | (string & {});

export interface SystemdUnit {
  name: string;
  active: boolean;
}

export interface GmailServiceInfo {
  serviceName: string;
  account: string | null;
  port: number | null;
  hookName: string | null;
  topic: string | null;
  subscription: string | null;
}

export interface TunnelInfo {
  accountId: string;
  tunnelId: string;
}

export interface HooksProxyInfo {
  token: string | null;
  port: number;
}

export interface GCloudProject {
  id: string;
  name: string;
}

// ─── Cloudflare API ──────────────────────────────────────────

export interface IngressRule {
  hostname?: string;
  service: string;
}

export interface TunnelApiConfig {
  config?: {
    ingress?: IngressRule[];
  };
}

// ─── Command Options ─────────────────────────────────────────

export interface SetupOptions {
  force?: boolean;
  skipInstall?: boolean;
  security?: boolean;
}

export interface AddGmailOptions {
  email?: string;
  project?: string;
  hookName?: string;
  port?: number;
  model?: string;
  channel?: string;
  target?: string;
}

export interface AddWebhookOptions {
  name?: string;
  secret?: string;
  secretField?: string;
  secretHeader?: string;
  model?: string;
  target?: string;
}

// ─── Gmail Service Builder ───────────────────────────────────

export interface GmailServiceOptions {
  email: string;
  port: number;
  topic: string;
  subscription: string;
  pushToken: string;
  hookUrl: string;
  hookToken: string;
  gogKeyringPassword: string;
}

// ─── Webhook Templates ───────────────────────────────────────

export interface WebhookTemplate {
  secretField?: string | null;
  secretHeader?: string | null;
  messageTemplate: string;
  action?: string;
  wakeMode?: string;
  sessionKey?: string;
}
