import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: process.env.DEV_PORT === 'auto' || '3000' === 'auto'
      ? 3000
      : Number(process.env.PORT || '3000' || 3000),
    strictPort: process.env.DEV_PORT !== 'auto' && '3000' !== 'auto',
    allowedHosts: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), react()],
});
