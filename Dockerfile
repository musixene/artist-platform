# The contents of this file are subject to the Common Public Attribution License Version 1.0 (CPAL-1.0); see LICENSE or https://opensource.org/license/CPAL-1.0. CPAL is based on MPL 1.1, with Sections 14 and 15 for attribution and network use. Original Code: Musixene Artist Platform. Original and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC). Copyright (c) 2026 Musixene. All Rights Reserved. The software is provided AS IS, WITHOUT WARRANTY OF ANY KIND.
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir /data && chown node:node /data
COPY --chown=node:node apps ./apps
COPY --chown=node:node packages ./packages
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/server/index.js"]
