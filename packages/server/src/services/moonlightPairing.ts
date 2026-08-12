import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { encrypt, decrypt } from './encryption.js';
import type { MlwPairInfo } from './moonlightWeb.js';

export interface MoonlightExtraConfig {
  httpPort?: number;
  httpsPort?: number;
  adminPort?: number;
  appName?: string;
  appId?: number;
  mlHostId?: number;
  paired?: boolean;
  bitrateKbps?: number;
  fps?: number;
  /** `auto` = client-area size; otherwise `WIDTHxHEIGHT` (e.g. `1920x1080`). */
  resolution?: string;
  /** moonlight-web TouchMode: pointAndDrag | localCursor | mouseRelative | touch. */
  touchMode?: string;
}

const RESOLUTION_RE = /^\d{3,5}x\d{3,5}$/i;

/** Normalize stored/request resolution; unset → `auto`. */
export function normalizeMoonlightResolution(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'auto';
  const v = raw.trim().toLowerCase();
  if (v === 'auto' || v === 'native') return 'auto';
  if (RESOLUTION_RE.test(v)) return v;
  return 'auto';
}

export const MOONLIGHT_TOUCH_MODES = [
  'pointAndDrag',
  'localCursor',
  'mouseRelative',
  'touch',
] as const;

export type MoonlightTouchMode = (typeof MOONLIGHT_TOUCH_MODES)[number];

/** Gatwy default — better than MLW’s mouseRelative on tablets. */
export const MOONLIGHT_TOUCH_MODE_DEFAULT: MoonlightTouchMode = 'pointAndDrag';

const TOUCH_MODE_SET = new Set<string>(MOONLIGHT_TOUCH_MODES);

/** Normalize stored/request touchMode; unset / invalid → `pointAndDrag`. */
export function normalizeMoonlightTouchMode(raw: unknown): MoonlightTouchMode {
  if (typeof raw !== 'string' || !raw.trim()) return MOONLIGHT_TOUCH_MODE_DEFAULT;
  const v = raw.trim();
  if (TOUCH_MODE_SET.has(v)) return v as MoonlightTouchMode;
  return MOONLIGHT_TOUCH_MODE_DEFAULT;
}

export interface StoredMoonlightPairing {
  connectionId: string;
  host: string;
  httpPort: number;
  mlHostId: number;
  pairInfo: MlwPairInfo;
  uniqueId?: string;
  savedAt: string;
}

function pairingDir(): string {
  return path.join(config.dataDir, 'moonlight', 'pairings');
}

function pairingPath(connectionId: string): string {
  return path.join(pairingDir(), `${connectionId}.enc`);
}

export function parseMoonlightExtra(raw: string | null | undefined): MoonlightExtraConfig {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MoonlightExtraConfig;
  } catch {
    return {};
  }
}

export function mergeMoonlightExtra(
  existing: MoonlightExtraConfig,
  patch: Partial<MoonlightExtraConfig>,
): MoonlightExtraConfig {
  return { ...existing, ...patch };
}

export function saveEncryptedPairing(data: StoredMoonlightPairing): void {
  fs.mkdirSync(pairingDir(), { recursive: true });
  const payload = encrypt(JSON.stringify(data));
  fs.writeFileSync(pairingPath(data.connectionId), payload, 'utf8');
}

export function loadEncryptedPairing(connectionId: string): StoredMoonlightPairing | null {
  const fp = pairingPath(connectionId);
  if (!fs.existsSync(fp)) return null;
  try {
    const decrypted = decrypt(fs.readFileSync(fp, 'utf8'));
    return JSON.parse(decrypted) as StoredMoonlightPairing;
  } catch (err) {
    console.warn('[Moonlight] Failed to decrypt pairing for', connectionId, err);
    return null;
  }
}

export function deleteEncryptedPairing(connectionId: string): void {
  const fp = pairingPath(connectionId);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch { /* ignore */ }
}

export function resolveHttpPort(port: number, extra: MoonlightExtraConfig): number {
  if (extra.httpPort && Number.isFinite(extra.httpPort)) return extra.httpPort;
  // Connection.port is the GameStream HTTP port (Sunshine default 47989)
  return port || 47989;
}
