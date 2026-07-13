FROM node:20-slim

# ffmpeg: media conversion. curl + ca-certificates: fetch yt-dlp over HTTPS below.
# python3: the "yt-dlp" release asset is a zipapp that needs a python3 interpreter
# on PATH — it is not a fully standalone binary.
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    ca-certificates \
    python3 \
    --no-install-recommends \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
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
