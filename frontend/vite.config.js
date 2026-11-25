import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Baca file .env dari root project_alpha/
  envDir: '..',
  // Batasi variabel yang diekspos ke browser agar secret backend tidak ikut ter-bundle
  envPrefix: ['VITE_', 'BACKEND_BASE_URL', 'BACKEND_REMOTE_URL', 'GOOGLE_CLIENT_ID'],
});