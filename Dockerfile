FROM node:20-slim

# Install ffmpeg and curl
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Install yt-dlp (standalone binary, no Python needed)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

# Install Node dependencies (production only)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Temp folder for in-progress downloads
RUN mkdir -p temp

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]
