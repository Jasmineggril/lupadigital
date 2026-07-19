import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Plugins do Replit — só carregados quando rodando dentro do ambiente Replit (dev)
const isReplit = process.env.REPL_ID !== undefined;
const isDev = process.env.NODE_ENV !== 'production';

const rawPort = process.env.PORT ?? '3000';
const port = Number(rawPort);
const basePath = process.env.BASE_PATH ?? '/';

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

export default defineConfig({
  base: basePath,
  envPrefix: ['VITE_'],
  plugins: [
    react(),
    tailwindcss(),
    // Modal de erro em runtime — só no ambiente Replit (dev), não no Vercel
    ...(isDev && isReplit
      ? [await import('@replit/vite-plugin-runtime-error-modal').then((m) => m.default())]
      : []),
    // Ferramentas de dev do Replit — só quando REPL_ID está presente
    ...(isDev && isReplit
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({ root: path.resolve(import.meta.dirname, '..') }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
