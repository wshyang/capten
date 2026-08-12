import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
});
