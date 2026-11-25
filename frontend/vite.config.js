import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const remoteUrl = String(env.BACKEND_REMOTE_URL || '').replace(/\/+$/, '');

  let proxyConfig;
  if (remoteUrl) {
    const parsed = new URL(remoteUrl);
    const targetOrigin = parsed.origin;
    const targetBasePath = parsed.pathname.replace(/\/+$/, '');

    proxyConfig = {
      '/_remote_backend': {
        target: targetOrigin,
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          `${targetBasePath}${path.replace(/^\/_remote_backend/, '')}`,
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const setCookie = proxyRes.headers['set-cookie'];
            if (!setCookie) return;
            const list = Array.isArray(setCookie) ? setCookie : [setCookie];
            // Sesuaikan cookie remote (SameSite=None; Secure) menjadi First-Party HTTP lokal
            proxyRes.headers['set-cookie'] = list.map((cookie) =>
              cookie
                .replace(/;\s*Secure/gi, '')
                .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
            );
          });
        },
      },
    };
  }

  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    envPrefix: [
      'VITE_',
      'BACKEND_BASE_URL',
      'BACKEND_REMOTE_URL',
      'GOOGLE_CLIENT_ID',
    ],
    server: {
      proxy: proxyConfig,
    },
  };
});