/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_URL?: string;
  // Streamix integration (Pôle 2 HLS + Pôle 3 IA)
  readonly VITE_HLS_BASE_URL?: string;
  readonly VITE_KEY_SERVER_URL?: string;
  readonly VITE_HLS_TOKEN?: string;
  readonly VITE_AI_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
