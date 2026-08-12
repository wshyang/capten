# ==============================================================================
# Dockerfile — Capten Web Application (UAT & Production Deployment)
#
# ARCHITECTURAL NOTE:
#   1) Why is code used for model training mixed with production Web code in Git?
#      - Capten's neural network training modules (src/engine/ai/nn/tournament32.ts,
#        training.ts, etc.) share the authoritative game rules engine, board physics
#        (src/engine/reducer.ts, interception.ts), and state encoders with the web app.
#      - Keeping them in the same repository guarantees that whenever tabletop rules
#        evolve, AI self-play training matches the exact physics the browser runs.
#   2) Will tournament TS modules eventually make their way into the prod server?
#      - No. During 'npm run build' in Stage 1 below, Vite's tree-shaking bundler
#        only packages imports reachable from src/App.tsx -> src/main.tsx.
#      - Because src/App.tsx only imports the client-side inference helper
#        (predictActionSync) and the static weight JSON (/checkpoints/supreme_champion.json),
#        none of the Node-based tournament runners, filesystem tools, or training scripts
#        are bundled into the production web bundle (dist/).
# ==============================================================================

# ─── STAGE 1: Build Static Frontend Bundle ───
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for optimal Docker layer caching
COPY package*.json ./
RUN npm ci

# Copy project source and build optimized static assets
COPY . .
RUN npm run build

# ─── STAGE 2: Lightweight Production Nginx Server ───
FROM nginx:alpine AS runner

# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx SPA and checkpoint configuration
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static web bundle and supreme champion checkpoint from Builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Ensure non-root ownership for security hardening
RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
