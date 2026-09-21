/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VERCEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@config' {
  const config: Record<string, unknown>;
  export default config;
}

declare module '*.yml' {
  const content: Record<string, unknown>;
  export default content;
}
