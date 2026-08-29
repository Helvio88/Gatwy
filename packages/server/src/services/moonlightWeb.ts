import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { config } from '../config.js';

const MLW_USER = 'gatwy';
const MLW_HEADER = 'X-Gatwy-Moonlight-User';
const DEFAULT_BIND = 'moonlight-web:19080';
const PATH_PREFIX = '/mlw';
const READY_TIMEOUT_MS = 90000;

export const MOONLIGHT_MISSING_HINT =
  'Moonlight sidecar is not available. Set ENABLE_MOONLIGHT=1 to run moonlight-web-stream in the moonlight-web sidecar.';

export interface MlwHost {
  host_id: number;
  name?: string;
  address?: string;
  http_port?: number;
  https_port?: number;
  paired?: 'Paired' | 'NotPaired' | string;
  server_state?: unknown;
  [key: string]: unknown;
}

export interface MlwApp {
  app_id: number;
  title: string;
  is_hdr_supported?: boolean;
}

export interface MlwPairInfo {
  client_private_key: string;
  client_certificate: string;
  server_certificate: string;
}

let starting: Promise<void> | null = null;
let shuttingDown = false;
let lastFailure: string | null = null;
let readyOnce = false;

function moonlightDir(): string {
  return path.join(config.dataDir, 'moonlight-web');
}

function isMoonlightEnabled(): boolean {
  const flag = (process.env.ENABLE_MOONLIGHT ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function bindHostPort(): { host: string; port: number } {
  const [host, portStr] = DEFAULT_BIND.split(':');
  return { host: host || 'moonlight-web', port: parseInt(portStr || '19080', 10) };
}

async function waitForReady(timeoutMs = READY_TIMEOUT_MS): Promise<void> {
  const { host, port } = bindHostPort();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (shuttingDown) {
      throw new Error(`Moonlight web-server did not become ready on ${host}:${port}`);
    }
    try {
      await mlwRequest('GET', '/mlw/config.js', undefined, { timeoutMs: 4000 });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Moonlight web-server did not become ready on ${host}:${port}`);
}

export const MOONLIGHT_UNAVAILABLE_BODY = {
  error: 'Moonlight runtime not available in this installation',
  available: false as const,
};

export function isMoonlightWebAvailable(): boolean {
  return isMoonlightEnabled();
}

/** Last crash / start failure, if any. Empty when the runtime is healthy. */
export function getMoonlightRuntimeError(): string | null {
  return lastFailure;
}

export function runtimeFeatures(): { moonlight: boolean } {
  return { moonlight: isMoonlightWebAvailable() };
}

export function filterListedConnections<T extends { protocol: string }>(
  rows: T[],
  moonlightAvailable = isMoonlightWebAvailable(),
): T[] {
  if (moonlightAvailable) return rows;
  return rows.filter((r) => r.protocol !== 'moonlight');
}

export function moonlightUnavailablePayload(available: boolean): typeof MOONLIGHT_UNAVAILABLE_BODY | null {
  if (available) return null;
  return MOONLIGHT_UNAVAILABLE_BODY;
}

function recordFailure(message: string): void {
  lastFailure = message;
  console.error(`[Moonlight] ${message}`);
}

export async function ensureMoonlightWeb(): Promise<void> {
  if (!isMoonlightWebAvailable()) {
    throw new Error(MOONLIGHT_MISSING_HINT);
  }
  if (readyOnce) return;
  if (starting) return starting;

  shuttingDown = false;
  starting = (async () => {
    try {
      await waitForReady();
      readyOnce = true;
      lastFailure = null;
      console.log('[Moonlight] web-server ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordFailure(message);
      throw err instanceof Error ? err : new Error(message);
    }
  })().finally(() => { starting = null; });

  return starting;
}

export function stopMoonlightWeb(): void {
  shuttingDown = true;
  readyOnce = false;
  starting = null;
}

function mlwBase(): { protocol: typeof http | typeof https; host: string; port: number } {
  const { host, port } = bindHostPort();
  return { protocol: http, host, port };
}

export async function mlwRequest(
  method: string,
  urlPath: string,
  body?: unknown,
  opts?: { timeoutMs?: number; accept?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const { protocol, host, port } = mlwBase();
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));

  return new Promise((resolve, reject) => {
    const req = protocol.request(
      {
        host,
        port,
        path: urlPath,
        method,
        headers: {
          [MLW_HEADER]: MLW_USER,
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
          ...(opts?.accept ? { Accept: opts.accept } : {}),
        },
        timeout: opts?.timeoutMs ?? 30000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 500,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Moonlight web request timed out'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

/** Read NDJSON stream (pair / list hosts). */
export async function mlwNdjson(
  method: string,
  urlPath: string,
  body?: unknown,
  onLine?: (obj: unknown) => void,
  timeoutMs = 120000,
): Promise<unknown[]> {
  const { protocol, host, port } = mlwBase();
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));

  return new Promise((resolve, reject) => {
    const req = protocol.request(
      {
        host,
        port,
        path: urlPath,
        method,
        headers: {
          [MLW_HEADER]: MLW_USER,
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
          Accept: 'application/x-ndjson',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if ((res.statusCode ?? 500) >= 400) {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            reject(new Error(`Moonlight API ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8')}`));
          });
          return;
        }

        let buf = '';
        const lines: unknown[] = [];
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              const obj = JSON.parse(line);
              lines.push(obj);
              onLine?.(obj);
            } catch {
              lines.push(line);
              onLine?.(line);
            }
          }
        });
        res.on('end', () => {
          const rest = buf.trim();
          if (rest) {
            try {
              const obj = JSON.parse(rest);
              lines.push(obj);
              onLine?.(obj);
            } catch {
              lines.push(rest);
              onLine?.(rest);
            }
          }
          resolve(lines);
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Moonlight NDJSON request timed out'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

export async function mlwGetHost(hostId: number): Promise<MlwHost> {
  const res = await mlwRequest('GET', `${PATH_PREFIX}/api/host?host_id=${hostId}`);
  if (res.status >= 400) throw new Error(`Failed to get host: ${res.body.toString('utf8')}`);
  const data = JSON.parse(res.body.toString('utf8')) as { host: MlwHost };
  return data.host;
}

export async function mlwAddHost(address: string, httpPort: number): Promise<MlwHost> {
  const res = await mlwRequest('POST', `${PATH_PREFIX}/api/host`, {
    address,
    http_port: httpPort,
  });
  if (res.status >= 400) {
    const raw = res.body.toString('utf8');
    if (/Connect|Connection reset|timed out|HostNotFound|os error/i.test(raw)) {
      throw new Error(
        `Cannot reach Sunshine at ${address}:${httpPort}. Check host power, firewall (TCP 47989/47984), and that Sunshine is running.`,
      );
    }
    throw new Error(`Failed to add host: ${raw}`);
  }
  const data = JSON.parse(res.body.toString('utf8')) as { host: MlwHost };
  return data.host;
}

export async function mlwDeleteHost(hostId: number): Promise<void> {
  const res = await mlwRequest('DELETE', `${PATH_PREFIX}/api/host?host_id=${hostId}`);
  if (res.status >= 400 && res.status !== 404) {
    throw new Error(`Failed to delete host: ${res.body.toString('utf8')}`);
  }
}

export async function mlwListApps(hostId: number): Promise<MlwApp[]> {
  const res = await mlwRequest('GET', `${PATH_PREFIX}/api/apps?host_id=${hostId}`);
  if (res.status >= 400) throw new Error(`Failed to list apps: ${res.body.toString('utf8')}`);
  const data = JSON.parse(res.body.toString('utf8')) as { apps: MlwApp[] };
  return data.apps ?? [];
}

/**
 * Start pairing. Invokes onPin as soon as the PIN line arrives, then resolves
 * when pairing completes (or rejects on PairError / timeout).
 */
export async function mlwPair(
  hostId: number,
  onPin: (pin: string) => void,
): Promise<MlwHost> {
  let paired: MlwHost | null = null;
  let error: string | null = null;

  await mlwNdjson(
    'POST',
    `${PATH_PREFIX}/api/pair`,
    { host_id: hostId },
    (obj) => {
      if (obj && typeof obj === 'object' && 'Pin' in (obj as object)) {
        onPin(String((obj as { Pin: string }).Pin));
      } else if (obj && typeof obj === 'object' && 'Paired' in (obj as object)) {
        paired = (obj as { Paired: MlwHost }).Paired;
      } else if (obj === 'PairError' || (obj && typeof obj === 'object' && 'PairError' in (obj as object))) {
        error = 'Pairing failed or was cancelled on the Sunshine host';
      }
    },
    180000,
  );

  if (error) throw new Error(error);
  if (!paired) throw new Error('Pairing did not complete');
  return paired;
}

type HostRecord = {
  id?: number;
  host_id?: number;
  pair_info?: MlwPairInfo;
  [key: string]: unknown;
};

function iterateHosts(raw: Record<string, unknown>): HostRecord[] {
  const hosts = raw.hosts;
  if (Array.isArray(hosts)) return hosts as HostRecord[];
  if (hosts && typeof hosts === 'object') {
    return Object.entries(hosts as Record<string, HostRecord>).map(([key, value]) => ({
      ...value,
      id: value.id ?? value.host_id ?? Number(key),
    }));
  }
  return [];
}

/** Read pairing material from moonlight-web data.json for encrypted backup. */
export function readPairInfoFromStorage(hostId: number): MlwPairInfo | null {
  const dataPath = path.join(moonlightDir(), 'data.json');
  if (!fs.existsSync(dataPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Record<string, unknown>;
    const host = iterateHosts(raw).find((h) => (h.id ?? h.host_id) === hostId);
    if (host?.pair_info?.client_private_key && host.pair_info.client_certificate) {
      return host.pair_info;
    }
  } catch (err) {
    console.warn('[Moonlight] Failed to read pair_info from storage:', err);
  }
  return null;
}

/** Restore pairing material into moonlight-web data.json (best-effort). */
export function restorePairInfoToStorage(hostId: number, pairInfo: MlwPairInfo): void {
  const dataPath = path.join(moonlightDir(), 'data.json');
  if (!fs.existsSync(dataPath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Record<string, unknown>;
    const hosts = raw.hosts;
    if (Array.isArray(hosts)) {
      const host = (hosts as HostRecord[]).find((h) => (h.id ?? h.host_id) === hostId);
      if (!host) return;
      host.pair_info = pairInfo;
    } else if (hosts && typeof hosts === 'object') {
      const map = hosts as Record<string, HostRecord>;
      const key = Object.keys(map).find((k) => {
        const h = map[k];
        return (h.id ?? h.host_id ?? Number(k)) === hostId;
      });
      if (!key) return;
      map[key] = { ...map[key], pair_info: pairInfo };
      raw.hosts = map;
    } else {
      return;
    }
    fs.writeFileSync(dataPath, JSON.stringify(raw, null, 2));
  } catch (err) {
    console.warn('[Moonlight] Failed to restore pair_info:', err);
  }
}

export function moonlightPathPrefix(): string {
  return PATH_PREFIX;
}

export function moonlightProxyHeader(): { name: string; value: string } {
  return { name: MLW_HEADER, value: MLW_USER };
}

export function moonlightUpstream(): { host: string; port: number } {
  return bindHostPort();
}
