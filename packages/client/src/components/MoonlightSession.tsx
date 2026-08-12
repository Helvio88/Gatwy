import { useCallback, useEffect, useRef, useState } from 'react';
import { DisconnectOverlay } from './DisconnectOverlay';
import { MoonlightPairModal } from './MoonlightPairModal';
import {
  ML_RESOLUTION_AUTO,
  ML_RESOLUTION_PRESETS,
  appendStreamLaunchParams,
  normalizeMlResolution,
  resolutionToMlwVideoSize,
  sizesDiffer,
  snapStreamSize,
} from '../lib/moonlightResolution';

type SessionStatus = 'connecting' | 'pairing' | 'streaming' | 'disconnected';

interface MoonlightSessionProps {
  connectionId: string;
  connectionName: string;
  isActive: boolean;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
  onClose?: (connectionId: string) => void;
}

interface StatusResponse {
  available: boolean;
  paired: boolean;
  hostId: number;
  host: string;
  appName?: string;
  apps?: { appId: number; title: string }[];
  bitrateKbps?: number;
  fps?: number;
  resolution?: string;
  error?: string;
}

interface SessionResponse {
  sessionId: string;
  hostId: number;
  appId: number;
  appTitle: string;
  streamPath: string;
  bitrateKbps: number;
  fps: number;
  resolution?: string;
  needsPairing?: boolean;
  error?: string;
}

const RESIZE_DEBOUNCE_MS = 220;

/** Injected into the same-origin /mlw iframe: quiet stats + Gatwy-style connecting chrome.
 * Keep in sync with docker/mlw-patches/gatwy-stream.css (baked into the image). */
const MLW_CHROME_STYLE = `
.video-stats {
  color: rgba(255, 255, 255, 0.55) !important;
  text-shadow: none !important;
  font-size: 11px !important;
  font-weight: 400 !important;
  line-height: 1.35 !important;
  letter-spacing: 0.01em !important;
  opacity: 0.55 !important;
  white-space: pre !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  background: transparent !important;
  padding: 0 !important;
  border: none !important;
  box-shadow: none !important;
  position: absolute !important;
  top: 10px !important;
  left: 10px !important;
  z-index: 5 !important;
  max-width: min(42vw, 360px) !important;
  pointer-events: none !important;
}

/* Neutralize cyan neon Connecting splash (ConnectionInfoModal / host-loading). */
html.stream {
  --accent-cyan: rgba(255, 255, 255, 0.4);
  --accent-cyan-2: rgba(255, 255, 255, 0.5);
  --accent-cyan-light: rgba(255, 255, 255, 0.6);
  --glow-cyan: none;
  --glow-cyan-bright: none;
  --shadow-button: 0 4px 12px rgba(0, 0, 0, 0.45);
  --text-1: rgba(255, 255, 255, 0.65);
}
.modal-background:not(.modal-disabled):has(.modal-video-connect),
.modal-background:not(.modal-disabled):has(.host-loading-overlay) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: rgba(0, 0, 0, 0.62) !important;
  backdrop-filter: blur(1px) !important;
}
.modal-background:not(.modal-disabled):has(.modal-video-connect) .modal-content,
.modal-background:not(.modal-disabled):has(.host-loading-overlay) .modal-content {
  background: rgba(16, 16, 18, 0.94) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5) !important;
  color: rgba(255, 255, 255, 0.65) !important;
  width: auto !important;
  max-width: min(280px, 84vw) !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 14px 16px !important;
  border-radius: 10px !important;
  text-shadow: none !important;
  overflow: hidden !important;
}
.modal-video-connect {
  align-items: center !important;
  gap: 8px !important;
  min-height: 0 !important;
}
.modal-video-connect > p,
.modal-video-connect .textlike {
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: 1.35 !important;
  color: rgba(255, 255, 255, 0.55) !important;
  text-shadow: none !important;
  text-align: center !important;
  margin: 0 !important;
  white-space: pre-wrap !important;
}
.modal-video-connect .modal-video-connect-options {
  width: 100%;
  justify-content: center !important;
  gap: 6px !important;
  margin-top: 2px !important;
  min-height: 28px !important;
}
/* MLW appends Show logs first, Close second — hide Show logs during normal connect. */
.modal-video-connect:not(:has(.modal-video-connect-debug)) .modal-video-connect-options button:first-child {
  display: none !important;
}
.modal-video-connect:hover:not(:has(.modal-video-connect-debug)) .modal-video-connect-options button:first-child,
.modal-video-connect:focus-within:not(:has(.modal-video-connect-debug)) .modal-video-connect-options button:first-child,
.modal-video-connect:has(.modal-video-connect-debug) .modal-video-connect-options button:first-child {
  display: inline-flex !important;
}
.modal-video-connect .modal-video-connect-options button,
.modal-video-connect button {
  background: transparent !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  color: rgba(255, 255, 255, 0.5) !important;
  box-shadow: none !important;
  text-shadow: none !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  padding: 5px 10px !important;
  border-radius: 8px !important;
  margin: 0 !important;
}
.modal-video-connect .modal-video-connect-options button:hover,
.modal-video-connect button:hover {
  background: rgba(255, 255, 255, 0.06) !important;
  color: rgba(255, 255, 255, 0.78) !important;
  transform: none !important;
}
.modal-video-connect .modal-video-connect-debug {
  max-width: 100% !important;
  max-height: 28vh !important;
  font-size: 11px !important;
  color: rgba(255, 255, 255, 0.4) !important;
  text-shadow: none !important;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 8px;
  margin-top: 4px;
}
.host-element.connecting::before {
  width: 18px !important;
  height: 18px !important;
  margin: -9px 0 0 -9px !important;
  border: 1.5px solid rgba(255, 255, 255, 0.16) !important;
  border-top-color: rgba(255, 255, 255, 0.55) !important;
  box-shadow: none !important;
}
.host-loading-overlay {
  background: rgba(0, 0, 0, 0.62) !important;
  backdrop-filter: blur(1px) !important;
}
.host-loading-spinner {
  width: 18px !important;
  height: 18px !important;
  border: 1.5px solid rgba(255, 255, 255, 0.14) !important;
  border-top-color: rgba(255, 255, 255, 0.55) !important;
  box-shadow: none !important;
}
.host-loading-text {
  font-size: 12px !important;
  color: rgba(255, 255, 255, 0.55) !important;
  text-shadow: none !important;
}
.host-loading-cancel {
  background: transparent !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  color: rgba(255, 255, 255, 0.5) !important;
  box-shadow: none !important;
  text-shadow: none !important;
  font-size: 11px !important;
  font-weight: 500 !important;
}
.host-loading-cancel:hover,
.host-loading-cancel:active,
.host-loading-cancel:focus {
  transform: none !important;
  background: rgba(255, 255, 255, 0.06) !important;
  box-shadow: none !important;
}
`;

/**
 * Force StartStream.settings.sops = true (Moonlight "Optimize game settings").
 * Sunshine applies dd_resolution_option=auto / client width×height only when sops is on.
 */
const MLW_SOPS_SCRIPT = `
(function(){
  if (typeof WebSocket === 'undefined') return;
  if (WebSocket.prototype.__gatwySopsWrapped) return;
  var originalSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function(data) {
    try {
      if (typeof data === 'string' && data.indexOf('StartStream') !== -1) {
        var msg = JSON.parse(data);
        if (msg && msg.StartStream && msg.StartStream.settings) {
          msg.StartStream.settings.sops = true;
          data = JSON.stringify(msg);
        }
      }
    } catch (e) {}
    return originalSend.call(this, data);
  };
  WebSocket.prototype.__gatwySopsWrapped = true;
})();
`;

function mapStatus(s: SessionStatus): 'connecting' | 'connected' | 'disconnected' {
  if (s === 'streaming') return 'connected';
  if (s === 'disconnected') return 'disconnected';
  return 'connecting';
}

function measureClientArea(el: HTMLElement | null): { width: number; height: number } {
  if (!el) return snapStreamSize(1920, 1080);
  return snapStreamSize(el.clientWidth || 1920, el.clientHeight || 1080);
}

/** Write moonlight-web launch settings (bitrate/fps/size/sops) before (re)loading the iframe. */
function applyMlwSettings(
  bitrateKbps: number,
  fps: number,
  resolution: string,
  clientArea: { width: number; height: number } | null,
): { width: number; height: number } {
  const mapped = resolutionToMlwVideoSize(resolution, clientArea);
  try {
    const raw = localStorage.getItem('mlSettings');
    const settings = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    settings.dataTransport = 'websocket';
    settings.bitrate = bitrateKbps;
    settings.fps = fps;
    settings.videoSize = mapped.videoSize;
    settings.videoSizeCustom = mapped.videoSizeCustom;
    settings.enterFullscreenOnStreamStart = false;
    // Moonlight Optimize game settings — required for Sunshine client resolution.
    settings.sops = true;
    localStorage.setItem('mlSettings', JSON.stringify(settings));
  } catch { /* ignore */ }
  return mapped.videoSizeCustom;
}

function injectIframeChrome(iframe: HTMLIFrameElement | null): void {
  try {
    const doc = iframe?.contentDocument;
    if (!doc?.head) return;
    if (!doc.getElementById('gatwy-mlw-chrome-style')) {
      const style = doc.createElement('style');
      style.id = 'gatwy-mlw-chrome-style';
      style.textContent = MLW_CHROME_STYLE;
      doc.head.appendChild(style);
    }
    if (!doc.getElementById('gatwy-mlw-sops-script')) {
      const script = doc.createElement('script');
      script.id = 'gatwy-mlw-sops-script';
      script.textContent = MLW_SOPS_SCRIPT;
      // Prefer earliest execution; head may already have finished parsing.
      doc.documentElement.appendChild(script);
    }
  } catch { /* cross-origin or not ready */ }
}

async function stopIframeStream(iframe: HTMLIFrameElement | null): Promise<void> {
  try {
    // moonlight-web exposes ViewerApp on window.app
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = (iframe?.contentWindow as any)?.app;
    const stream = app?.getStream?.();
    if (stream?.stop) {
      await Promise.race([
        stream.stop(),
        new Promise((r) => setTimeout(r, 400)),
      ]);
    }
  } catch { /* ignore */ }
}

function toggleIframeStats(iframe: HTMLIFrameElement | null): boolean {
  try {
    const doc = iframe?.contentDocument;
    if (!doc) return false;
    const buttons = Array.from(doc.querySelectorAll('button'));
    const statsBtn = buttons.find((b) => {
      const t = (b.textContent || '').trim().toLowerCase();
      return t === 'stats' || t === '统计' || t.includes('stats');
    });
    if (!statsBtn) return false;
    statsBtn.click();
    return true;
  } catch {
    return false;
  }
}

export function MoonlightSession({
  connectionId,
  connectionName,
  isActive,
  onStatusChange,
  onClose,
}: MoonlightSessionProps) {
  const sessionRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSizeRef = useRef<{ width: number; height: number } | null>(null);
  const streamBasePathRef = useRef<string | null>(null);
  const resizingRef = useRef(false);
  const bitrateRef = useRef(20000);
  const fpsRef = useRef(60);
  const resolutionRef = useRef(ML_RESOLUTION_AUTO);

  const [status, setStatus] = useState<SessionStatus>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [pin, setPin] = useState<string | null>(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamEpoch, setStreamEpoch] = useState(0);
  const [appTitle, setAppTitle] = useState('Desktop');
  const [hostLabel, setHostLabel] = useState(connectionName);
  const [bitrate, setBitrate] = useState(20000);
  const [fps, setFps] = useState(60);
  const [resolution, setResolution] = useState(ML_RESOLUTION_AUTO);
  const [activeSizeLabel, setActiveSizeLabel] = useState('');
  const [reconnectCount, setReconnectCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statsOn, setStatsOn] = useState(false);

  bitrateRef.current = bitrate;
  fpsRef.current = fps;
  resolutionRef.current = resolution;

  function setAndNotify(s: SessionStatus) {
    setStatus(s);
    onStatusChange?.(mapStatus(s));
  }

  const persistSettings = useCallback(async (patch: {
    bitrateKbps?: number;
    fps?: number;
    resolution?: string;
  }) => {
    try {
      await fetch(`/api/v1/moonlight/${connectionId}/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch { /* ignore */ }
  }, [connectionId]);

  const auditDisconnect = useCallback(async () => {
    try {
      await fetch(`/api/v1/moonlight/${connectionId}/disconnect-audit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
    } catch { /* ignore */ }
  }, [connectionId]);

  const handleDisconnect = useCallback(() => {
    abortRef.current?.abort();
    void auditDisconnect();
    setStreamUrl(null);
    onClose?.(connectionId);
  }, [auditDisconnect, connectionId, onClose]);

  const toggleFullscreen = useCallback(() => {
    const el = sessionRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Auto-open panel briefly when streaming starts (matches RDP).
  useEffect(() => {
    if (status === 'streaming') {
      setPanelOpen(true);
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = setTimeout(() => setPanelOpen(false), 3000);
    }
    return () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    };
  }, [status]);

  /**
   * Restart the embedded moonlight-web stream with updated launch size.
   * Moonlight/Sunshine set desktop resolution at stream start — mid-session
   * resize requires a clean stream restart (not CSS scaling).
   *
   * Pass intended resolution/bitrate/fps explicitly — do not rely on React
   * state refs synced during render (setState + immediate relaunch leaves them stale).
   */
  const relaunchStream = useCallback(async (opts: {
    width: number;
    height: number;
    resolution: string;
    bitrateKbps?: number;
    fps?: number;
  }) => {
    const base = streamBasePathRef.current;
    if (!base || resizingRef.current) return;
    resizingRef.current = true;
    const nextSize = { width: opts.width, height: opts.height };
    const resolution = normalizeMlResolution(opts.resolution);
    const bitrateKbps = opts.bitrateKbps ?? bitrateRef.current;
    const fps = opts.fps ?? fpsRef.current;
    // Keep refs aligned before await gaps so Auto resize / concurrent handlers see the intent.
    resolutionRef.current = resolution;
    bitrateRef.current = bitrateKbps;
    fpsRef.current = fps;
    try {
      await stopIframeStream(iframeRef.current);
      applyMlwSettings(bitrateKbps, fps, resolution, nextSize);
      activeSizeRef.current = nextSize;
      setActiveSizeLabel(`${nextSize.width}×${nextSize.height}`);
      const url = appendStreamLaunchParams(base, {
        bitrateKbps,
        fps,
        resolution,
        clientArea: nextSize,
      });
      setStreamUrl(url);
      setStreamEpoch((n) => n + 1);
    } finally {
      // Allow another resize after the new iframe has a chance to start
      setTimeout(() => { resizingRef.current = false; }, 500);
    }
  }, []);

  const statusRef = useRef(status);
  statusRef.current = status;

  // Debounced client-area resize → host resolution change (Auto mode only).
  useEffect(() => {
    if (status !== 'streaming' || resolution !== ML_RESOLUTION_AUTO) return;
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => {
        if (resolutionRef.current !== ML_RESOLUTION_AUTO) return;
        if (statusRef.current !== 'streaming') return;
        const next = measureClientArea(surfaceRef.current);
        const prev = activeSizeRef.current;
        if (prev && !sizesDiffer(prev, next)) return;
        void relaunchStream({
          width: next.width,
          height: next.height,
          resolution: ML_RESOLUTION_AUTO,
        });
      }, RESIZE_DEBOUNCE_MS);
    });

    observer.observe(surface);
    return () => {
      observer.disconnect();
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
    };
  }, [status, resolution, relaunchStream]);

  const forgetPairing = useCallback(async () => {
    try {
      await fetch(`/api/v1/moonlight/${connectionId}/pairing`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch { /* ignore */ }
    setStreamUrl(null);
    setPin(null);
    setStatsOn(false);
    setReconnectCount((n) => n + 1);
  }, [connectionId]);

  const handleToggleStats = useCallback(() => {
    injectIframeChrome(iframeRef.current);
    if (toggleIframeStats(iframeRef.current)) {
      setStatsOn((v) => !v);
    }
  }, []);

  const handleResolutionChange = useCallback((value: string) => {
    const next = normalizeMlResolution(value);
    setResolution(next);
    // Sync immediately — setState alone leaves resolutionRef stale until the next render.
    resolutionRef.current = next;
    void persistSettings({ resolution: next });
    if (status !== 'streaming' || !streamBasePathRef.current) return;
    const area = next === ML_RESOLUTION_AUTO
      ? measureClientArea(surfaceRef.current)
      : resolutionToMlwVideoSize(next, null).videoSizeCustom;
    void relaunchStream({
      width: area.width,
      height: area.height,
      resolution: next,
    });
  }, [persistSettings, relaunchStream, status]);

  const startPairing = useCallback(async (signal: AbortSignal) => {
    setShowPairModal(true);
    setAndNotify('pairing');
    setPin(null);
    setErrorMsg('');

    const res = await fetch(`/api/v1/moonlight/${connectionId}/pair`, {
      method: 'POST',
      credentials: 'include',
      signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || `Pairing failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let paired = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        const obj = JSON.parse(line) as {
          pin?: string;
          paired?: boolean;
          error?: string;
          alreadyPaired?: boolean;
        };
        if (obj.pin) setPin(obj.pin);
        if (obj.error) throw new Error(obj.error);
        if (obj.paired) paired = true;
      }
    }

    if (!paired) throw new Error('Pairing did not complete');
    setShowPairModal(false);
    setPin(null);
  }, [connectionId]);

  const startStream = useCallback(async (
    signal: AbortSignal,
    prefs: { bitrateKbps: number; fps: number; resolution: string },
  ) => {
    // Wait a frame so the session surface has layout before measuring Auto size.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    let clientArea = measureClientArea(surfaceRef.current);
    if (clientArea.width <= 640 && clientArea.height <= 360) {
      await new Promise((r) => setTimeout(r, 50));
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      clientArea = measureClientArea(surfaceRef.current);
    }
    const launchSize = applyMlwSettings(prefs.bitrateKbps, prefs.fps, prefs.resolution, clientArea);

    const res = await fetch(`/api/v1/moonlight/${connectionId}/session`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bitrateKbps: prefs.bitrateKbps,
        fps: prefs.fps,
        resolution: prefs.resolution,
      }),
      signal,
    });
    const data = await res.json() as SessionResponse;
    if (res.status === 409 || data.needsPairing) {
      return 'needs-pairing' as const;
    }
    if (!res.ok) throw new Error(data.error || `Failed to start stream (${res.status})`);

    sessionIdRef.current = data.sessionId;
    streamBasePathRef.current = data.streamPath;
    setAppTitle(data.appTitle);
    setBitrate(data.bitrateKbps);
    setFps(data.fps);
    const resolvedRes = data.resolution
      ? normalizeMlResolution(data.resolution)
      : prefs.resolution;
    setResolution(resolvedRes);
    activeSizeRef.current = launchSize;
    setActiveSizeLabel(`${launchSize.width}×${launchSize.height}`);

    const url = appendStreamLaunchParams(data.streamPath, {
      bitrateKbps: data.bitrateKbps,
      fps: data.fps,
      resolution: resolvedRes,
      clientArea: launchSize,
    });
    setStreamUrl(url);
    setStreamEpoch((n) => n + 1);
    setAndNotify('streaming');
    return 'streaming' as const;
  }, [connectionId]);

  useEffect(() => {
    if (!isActive) return;

    const abort = new AbortController();
    abortRef.current = abort;
    let cancelled = false;

    async function run() {
      try {
        setAndNotify('connecting');
        setErrorMsg('');
        setStreamUrl(null);
        setShowPairModal(false);
        setStatsOn(false);
        activeSizeRef.current = null;
        streamBasePathRef.current = null;

        const statusRes = await fetch(`/api/v1/moonlight/${connectionId}/status`, {
          credentials: 'include',
          signal: abort.signal,
        });
        const st = await statusRes.json() as StatusResponse;
        if (!statusRes.ok) throw new Error(st.error || 'Failed to query Moonlight status');
        if (!st.available) throw new Error('Moonlight runtime is not available in this container build');

        setHostLabel(st.host || connectionName);
        const prefs = {
          bitrateKbps: typeof st.bitrateKbps === 'number' ? st.bitrateKbps : bitrateRef.current,
          fps: typeof st.fps === 'number' ? st.fps : fpsRef.current,
          resolution: st.resolution
            ? normalizeMlResolution(st.resolution)
            : resolutionRef.current,
        };
        setBitrate(prefs.bitrateKbps);
        setFps(prefs.fps);
        setResolution(prefs.resolution);

        if (!st.paired) {
          await startPairing(abort.signal);
          if (cancelled) return;
        }

        const result = await startStream(abort.signal, prefs);
        if (result === 'needs-pairing') {
          await startPairing(abort.signal);
          if (cancelled) return;
          await startStream(abort.signal, prefs);
        }
      } catch (err) {
        if (cancelled || abort.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Connection failed';
        setErrorMsg(msg);
        setShowPairModal((open) => open || msg.toLowerCase().includes('pair'));
        setAndNotify('disconnected');
      }
    }

    void run();

    return () => {
      cancelled = true;
      abort.abort();
      if (sessionIdRef.current) {
        void auditDisconnect();
        sessionIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, isActive, reconnectCount]);

  const statusLabel =
    status === 'streaming'
      ? 'Connected'
      : status === 'pairing'
      ? 'Waiting for PIN…'
      : status === 'disconnected'
      ? 'Disconnected'
      : status === 'connecting'
      ? 'Connecting…'
      : status;

  return (
    <div ref={sessionRef} className="absolute inset-0 flex flex-col bg-black overflow-hidden">
      <div ref={surfaceRef} className="flex-1 w-full relative overflow-hidden bg-black">
        {streamUrl && status === 'streaming' ? (
          <iframe
            key={`${streamUrl}::${streamEpoch}`}
            ref={iframeRef}
            title={`Moonlight ${connectionName}`}
            src={streamUrl}
            className="absolute inset-0 w-full h-full border-0"
            allow="fullscreen; autoplay; clipboard-read; clipboard-write; gamepad"
            onLoad={() => {
              injectIframeChrome(iframeRef.current);
              // Restore focus into the stream surface for keyboard input
              try { iframeRef.current?.contentWindow?.focus(); } catch { /* ignore */ }
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-secondary">
            {status === 'pairing' ? 'Waiting for Sunshine PIN confirmation…' : 'Preparing Moonlight stream…'}
          </div>
        )}

        {showPairModal && (
          <MoonlightPairModal
            pin={pin}
            hostLabel={hostLabel}
            error={status === 'disconnected' ? errorMsg : undefined}
            onCancel={handleDisconnect}
            onRetry={() => {
              setErrorMsg('');
              setReconnectCount((n) => n + 1);
            }}
          />
        )}
      </div>

      <DisconnectOverlay
        show={status === 'disconnected' && !showPairModal}
        message={errorMsg}
        onExit={() => onClose?.(connectionId)}
        onReconnect={() => {
          setErrorMsg('');
          setReconnectCount((n) => n + 1);
        }}
      />

      {panelOpen && (
        <div
          className="absolute inset-0 z-10"
          onClick={() => setPanelOpen(false)}
        />
      )}

      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-30">
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          title="Session controls"
          className="flex flex-col items-center justify-center gap-2 w-7 py-4 bg-black/60 hover:bg-black/80 text-gray-400 hover:text-white transition-colors rounded-l-md"
          style={{ writingMode: 'vertical-rl' }}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              status === 'disconnected'
                ? 'bg-red-500'
                : status === 'streaming'
                ? 'bg-green-500'
                : 'bg-yellow-500'
            }`}
            style={{ writingMode: 'horizontal-tb' }}
          />
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ writingMode: 'horizontal-tb' }}
            className={`transition-transform ${panelOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div
        className={`absolute right-5 top-1/2 -translate-y-1/2 z-20 w-56 bg-surface/95 backdrop-blur-xs border border-border rounded-xl shadow-2xl flex flex-col gap-1 p-3 transition-all duration-200 ${
          panelOpen ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-4 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 px-1 py-1.5 border-b border-border mb-1">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              status === 'disconnected'
                ? 'bg-red-500'
                : status === 'streaming'
                ? 'bg-green-500'
                : 'bg-yellow-500'
            }`}
          />
          <span className="text-sm text-text-primary font-medium truncate">
            {statusLabel}
          </span>
        </div>

        <div className="px-1 py-0.5">
          <p className="text-xs text-text-secondary truncate">{connectionName}</p>
          {appTitle && status === 'streaming' && (
            <p className="text-[11px] text-text-secondary/80 truncate mt-0.5">{appTitle}</p>
          )}
          {activeSizeLabel && status === 'streaming' && (
            <p className="text-[11px] text-text-secondary/80 truncate mt-0.5 tabular-nums">
              {activeSizeLabel}
              {resolution === ML_RESOLUTION_AUTO ? ' · auto' : ''}
            </p>
          )}
        </div>

        <div className="px-1 pt-1 pb-1.5 border-b border-border mb-1 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-text-primary">
            <span>Resolution</span>
            <select
              value={resolution}
              onChange={(e) => handleResolutionChange(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-1.5 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent"
              title="Stream resolution requested from Sunshine"
            >
              {ML_RESOLUTION_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-text-primary">
            <span>Mbps</span>
            <input
              type="number"
              min={1}
              max={150}
              value={Math.round(bitrate / 1000)}
              onChange={(e) => {
                const next = Math.max(1, parseInt(e.target.value, 10) || 20) * 1000;
                setBitrate(next);
                void persistSettings({ bitrateKbps: next });
              }}
              className="w-14 bg-surface border border-border rounded-md px-1.5 py-1 text-[11px] text-text-primary tabular-nums focus:outline-none focus:border-accent"
              title="Bitrate (applies on reconnect)"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-text-primary">
            <span>FPS</span>
            <input
              type="number"
              min={15}
              max={240}
              value={fps}
              onChange={(e) => {
                const next = Math.max(15, parseInt(e.target.value, 10) || 60);
                setFps(next);
                void persistSettings({ fps: next });
              }}
              className="w-14 bg-surface border border-border rounded-md px-1.5 py-1 text-[11px] text-text-primary tabular-nums focus:outline-none focus:border-accent"
              title="FPS (applies on reconnect)"
            />
          </label>
          <p className="text-[10px] text-text-secondary leading-relaxed">
            Auto tracks the tab size (host resize). Bitrate / FPS apply on reconnect. Sunshine must use client/auto resolution.
          </p>
        </div>

        <button
          type="button"
          onClick={() => { toggleFullscreen(); setPanelOpen(false); }}
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-hover text-text-primary text-sm transition-colors text-left w-full"
        >
          {isFullscreen ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
              Exit Fullscreen
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
              Fullscreen
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleToggleStats}
          disabled={status !== 'streaming'}
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-hover text-text-primary text-sm transition-colors text-left w-full disabled:opacity-40 disabled:pointer-events-none"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19V5" />
            <path d="M4 19h16" />
            <path d="M8 17V10" />
            <path d="M12 17V7" />
            <path d="M16 17v-5" />
          </svg>
          {statsOn ? 'Hide stats' : 'Show stats'}
        </button>

        <button
          type="button"
          onClick={() => { void forgetPairing(); setPanelOpen(false); }}
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-hover text-text-primary text-sm transition-colors text-left w-full"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
          </svg>
          Forget pairing
        </button>

        <div className="border-t border-border mt-1 pt-1">
          <button
            type="button"
            onClick={() => { handleDisconnect(); setPanelOpen(false); }}
            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-red-500/10 text-red-400 text-sm transition-colors text-left w-full"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
