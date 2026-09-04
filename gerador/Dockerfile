FROM node:20-slim

WORKDIR /app

# sharp precisa das libs de imagem
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY layout.js carimbo.js montar.js servico.js ./
COPY ativos ./ativos

ENV PORTA=8090 ATIVOS_DIR=/app/ativos NODE_ENV=production
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:8090/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "servico.js"]
