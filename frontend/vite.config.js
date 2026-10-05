import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  envDir: '..',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/chart.js') ||
            id.includes('node_modules/react-chartjs-2')
          )
            return 'charts';
          if (
            id.includes('node_modules/@radix-ui') ||
            id.includes('node_modules/@floating-ui')
          )
            return 'controls';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return 'react';
        },
      },
    },
  },
  server: { port: 5173 },
});
