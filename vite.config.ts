import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import fs from 'fs';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Copy onnxruntime-web's runtime .wasm binaries into /ort/ so the
    // browser can lazy-load them from a stable path when ORT initialises.
    // See src/engine/ai/nn/onnxInference.ts → configureONNXRuntime().
    viteStaticCopy({
      // vite-plugin-static-copy v4 preserves the source directory tree by
      // default (files land at /ort/node_modules/onnxruntime-web/dist/*).
      // `rename: { stripBase: true }` walks up the directory stack so each
      // file lands directly under /ort/ where ORT's wasmPaths expects it.
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: 'ort',
          rename: { stripBase: true },
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.mjs',
          dest: 'ort',
          rename: { stripBase: true },
        },
      ],
    }),
    {
      name: 'serve-checkpoints',
      configureServer(server) {
        server.middlewares.use('/checkpoints', (req, res, next) => {
          const filePath = path.join(__dirname, 'checkpoints', req.url || '');
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/json');
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
  ],
  optimizeDeps: {
    // ORT-Web ships as ESM but its dynamic wasm loader trips Vite's dep
    // scanner. Excluding it forces on-demand loading and stops Vite from
    // trying to bundle the wasm files itself.
    exclude: ['onnxruntime-web'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
});
