/**
 * Loopback server for web/dev mode (and browser-based tests).
 * Desktop uses IPC instead; both call the same HostApi.
 *
 * Security: binds 127.0.0.1 only; every API call needs a per-launch token
 * injected into the page, and a matching Origin. No CORS.
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_METHODS, HostApi, type HostMethod } from "./api";
import { SupersededError } from "./ai/orchestrator";
import { VersionConflictError } from "./store";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const STATIC = path.join(ROOT, "dist/renderer");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".json": "application/json",
};

export async function startServer(opts: { port?: number; dataDir?: string } = {}) {
  const api = await new HostApi(opts.dataDir ?? path.join(ROOT, ".phlo-data")).init();
  const token = randomBytes(24).toString("hex");
  const port = opts.port ?? Number(process.env.PHLO_PORT ?? 8765);
  const origin = `http://127.0.0.1:${port}`;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", origin);
      if (url.pathname.startsWith("/api/")) {
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        if (req.headers["x-phlo-token"] !== token) return send(res, 403, { error: "bad token" });
        const o = req.headers.origin;
        if (o && o !== origin && o !== `http://localhost:${port}`) return send(res, 403, { error: "bad origin" });
        const method = url.pathname.slice(5) as HostMethod;
        if (!HOST_METHODS.includes(method)) return send(res, 404, { error: "unknown method" });
        const body = await readBody(req, 30 * 1024 * 1024);
        const args = body ? (JSON.parse(body) as unknown[]) : [];
        try {
          const fn = api[method] as (...a: unknown[]) => unknown;
          const result = await fn.apply(api, args);
          return send(res, 200, { ok: true, result: result ?? null });
        } catch (e) {
          if (e instanceof SupersededError) return send(res, 200, { ok: false, code: "SUPERSEDED" });
          if (e instanceof VersionConflictError) return send(res, 200, { ok: false, code: "VERSION_CONFLICT", message: e.message });
          return send(res, 200, { ok: false, code: "ERROR", message: e instanceof Error ? e.message : String(e) });
        }
      }

      // Static files
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      const file = path.join(STATIC, path.normalize(rel));
      if (!file.startsWith(STATIC)) return send(res, 404, { error: "not found" });
      let data: Buffer;
      try {
        data = await fs.readFile(file);
      } catch {
        return send(res, 404, { error: "not found" });
      }
      if (file.endsWith(".html")) {
        data = Buffer.from(
          data.toString("utf8").replace("<head>", `<head><script>window.__PHLO_TOKEN__=${JSON.stringify(token)}</script>`),
        );
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(data);
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : "error" });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, api, url: origin, token };
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer().then(({ url }) => console.log(`Phlo is running at ${url}`));
}
