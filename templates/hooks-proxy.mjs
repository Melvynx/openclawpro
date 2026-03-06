import { createServer, request } from "node:http";
import { URL } from "node:url";

const GATEWAY = "127.0.0.1";
const GATEWAY_PORT = 18789;
const HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN;
const PORT = Number(process.env.PORT || 18800);

// ─── Route config ──────────────────────────────────────────
// Each route defines how to handle the incoming request.
//
//   Webhook routes (forward to OpenClaw gateway):
//     secretField : check body[field] (e.g. Codeline sends { secret: "..." })
//     secretHeader: check req.headers[header] (e.g. Stripe-Signature)
//     secret      : expected value
//
//   Gmail routes (forward directly to gog watch serve):
//     upstream    : "http://127.0.0.1:PORT" — strips the route prefix, forwards raw
//
// Routes without a config entry are forwarded to gateway without validation.

const ROUTES = {
// __ROUTES__
};

// ─── Helpers ───────────────────────────────────────────────

if (!HOOK_TOKEN) {
  console.error("OPENCLAW_HOOK_TOKEN is required");
  process.exit(1);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

function forwardToGateway(path, headers, body, res) {
  const proxy = request(
    {
      hostname: GATEWAY,
      port: GATEWAY_PORT,
      path,
      method: "POST",
      headers: {
        "content-type": headers["content-type"] || "application/json",
        host: `${GATEWAY}:${GATEWAY_PORT}`,
        authorization: `Bearer ${HOOK_TOKEN}`,
        "content-length": Buffer.byteLength(body),
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxy.on("error", (err) => {
    console.error(`proxy error: ${err.message}`);
    if (!res.headersSent) json(res, 502, { ok: false, error: "Bad Gateway" });
  });
  proxy.end(body);
}

function forwardToUpstream(upstreamBase, relPath, reqHeaders, body, res) {
  const upstream = new URL(upstreamBase);
  const proxy = request(
    {
      hostname: upstream.hostname,
      port: Number(upstream.port),
      path: relPath || "/",
      method: "POST",
      headers: {
        "content-type": reqHeaders["content-type"] || "application/json",
        "content-length": Buffer.byteLength(body),
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxy.on("error", (err) => {
    console.error(`upstream proxy error: ${err.message}`);
    if (!res.headersSent) json(res, 502, { ok: false, error: "Bad Gateway" });
  });
  proxy.end(body);
}

// ─── Server ────────────────────────────────────────────────

createServer(async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });

  // Split path from query string
  const [urlPath, queryString] = (req.url || "/").split("?");

  // Find matching route (exact or prefix)
  const route = Object.keys(ROUTES).find((r) => urlPath === r || urlPath.startsWith(r + "/"));
  const routeCfg = route ? ROUTES[route] : null;

  try {
    const rawBody = await readBody(req);

    // ── Gmail / upstream routes: forward transparently ──────
    if (routeCfg?.upstream) {
      const relPath = urlPath.slice(route.length) || "/";
      const fullRelPath = queryString ? `${relPath}?${queryString}` : relPath;
      console.log(`[${route}] upstream → ${routeCfg.upstream}${fullRelPath}`);
      forwardToUpstream(routeCfg.upstream, fullRelPath, req.headers, rawBody, res);
      return;
    }

    // ── Webhook routes: validate secret + forward to gateway ─
    let parsed = null;

    if (routeCfg) {
      if (routeCfg.secretField) {
        parsed = JSON.parse(rawBody.toString());
        if (parsed[routeCfg.secretField] !== routeCfg.secret) {
          console.warn(`[${route}] bad secret (body.${routeCfg.secretField})`);
          return json(res, 401, { ok: false, error: "Invalid secret" });
        }
      } else if (routeCfg.secretHeader) {
        const headerVal = req.headers[routeCfg.secretHeader.toLowerCase()];
        if (headerVal !== routeCfg.secret) {
          console.warn(`[${route}] bad secret (header ${routeCfg.secretHeader})`);
          return json(res, 401, { ok: false, error: "Invalid secret" });
        }
      }
    }

    // Inject _raw (full payload as string) so the AI gets everything
    parsed = parsed || JSON.parse(rawBody.toString());
    parsed._raw = JSON.stringify(parsed, null, 2);
    const enrichedBody = Buffer.from(JSON.stringify(parsed));

    const label = route || urlPath;
    console.log(`[${label}] type=${parsed.type || "?"} → /hooks${urlPath}`);

    forwardToGateway("/hooks" + urlPath, req.headers, enrichedBody, res);
  } catch (err) {
    console.error(`request error: ${err.message}`);
    json(res, 400, { ok: false, error: "Invalid request body" });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`hooks-proxy listening on 127.0.0.1:${PORT} → gateway :${GATEWAY_PORT}/hooks/*`);
  const webhookRoutes = Object.entries(ROUTES).filter(([, c]) => !c.upstream).map(([p]) => p);
  const gmailRoutes = Object.entries(ROUTES).filter(([, c]) => c.upstream).map(([p]) => p);
  if (webhookRoutes.length) console.log(`webhook routes: ${webhookRoutes.join(", ")}`);
  if (gmailRoutes.length) console.log(`gmail routes: ${gmailRoutes.join(", ")}`);
});
