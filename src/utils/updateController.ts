import type { DownloadEvent } from '@tauri-apps/plugin-updater';

export type UpdatePhase = 'idle' | 'disabled' | 'checking' | 'latest' | 'downloading' | 'ready' | 'installing' | 'restart' | 'error';
export interface UpdateState {
  phase: UpdatePhase;
  version?: string;
  notes?: string;
  downloaded: number;
  total?: number;
  error?: string;
}

export interface UpdatePackage {
  version: string;
  body?: string;
  download: (onEvent: (event: DownloadEvent) => void, options: { timeout: number }) => Promise<void>;
  install: () => Promise<void>;
  close: () => Promise<void>;
}

interface UpdateAdapter {
  enabled: () => Promise<boolean>;
  check: () => Promise<UpdatePackage | null>;
  prepare: () => Promise<void>;
  recover: () => Promise<void>;
  restart: () => Promise<void>;
}

// One controller across navigation/remounts: never download or install concurrently.
export function createUpdateController(adapter: UpdateAdapter) {
  let state: UpdateState = { phase: 'idle', downloaded: 0 };
  let pending: UpdatePackage | null = null;
  let busy = false;
  const listeners = new Set<() => void>();
  const publish = (next: Partial<UpdateState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async check() {
      if (busy || pending || state.phase === 'restart') return;
      busy = true;
      publish({ phase: 'checking', error: undefined, downloaded: 0, total: undefined, version: undefined, notes: undefined });
      let candidate: UpdatePackage | null = null;
      try {
        if (!await adapter.enabled()) {
          publish({ phase: 'disabled' });
          return;
        }
        candidate = await adapter.check();
        if (!candidate) {
          publish({ phase: 'latest' });
          return;
        }
        publish({ phase: 'downloading', version: candidate.version, notes: candidate.body });
        await candidate.download((event) => {
          if (event.event === 'Started') publish({ total: event.data.contentLength, downloaded: 0 });
          if (event.event === 'Progress') publish({ downloaded: state.downloaded + event.data.chunkLength });
        }, { timeout: 30 * 60 * 1000 });
        // Finished is emitted before signature verification; only the resolved promise is trusted.
        pending = candidate;
        candidate = null;
        publish({ phase: 'ready' });
      } catch (error) {
        publish({ phase: 'error', error: errorText(error) });
      } finally {
        await candidate?.close().catch(() => {});
        busy = false;
      }
    },
    async install() {
      if (busy || (!pending && state.phase !== 'restart')) return;
      busy = true;
      let prepared = false;
      let installed = state.phase === 'restart';
      publish({ phase: 'installing', error: undefined });
      try {
        prepared = true;
        await adapter.prepare();
        if (!installed && pending) {
          await pending.install();
          installed = true;
          await pending.close().catch(() => {});
          pending = null;
        }
        await adapter.restart();
        publish({ phase: 'restart' });
      } catch (error) {
        let detail = errorText(error);
        if (prepared) {
          try { await adapter.recover(); }
          catch (recoveryError) { detail += `\n${errorText(recoveryError)}`; }
        }
        // Discard an unsuccessful package so retries recheck and download a fresh copy.
        if (!installed) {
          await pending?.close().catch(() => {});
          pending = null;
        }
        publish({ phase: installed ? 'restart' : 'error', error: detail });
      } finally {
        busy = false;
      }
    },
  };
}
