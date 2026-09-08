/// <reference types="vite/client" />

interface Window {
  __TAURI__?: {
    core: { invoke: (command: 'open_help_docs') => Promise<void> };
  };
}
