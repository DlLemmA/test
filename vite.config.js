import { defineConfig } from 'vite';

// Set base path for GitHub Pages: '/<repo-name>/'
// Change this to match your repository name
const REPO_NAME = 'pinduoduo';

export default defineConfig({
  base: `/${REPO_NAME}/`,
  root: '.',
  publicDir: false,
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  },
  server: {
    port: 5173
  },
  optimizeDeps: {
    exclude: ['sql.js']
  },
  worker: {
    format: 'es'
  }
});