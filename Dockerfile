FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-draw \
    fonts-thai-tlwg fonts-noto-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]
