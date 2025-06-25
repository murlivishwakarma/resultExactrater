# ✅ Puppeteer base image with Chromium already installed
# ✅ Puppeteer base image with Chromium already installed
FROM ghcr.io/puppeteer/puppeteer:19.11.1

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

# 🛠️ Use root temporarily to fix permissions
USER root
COPY package*.json ./
RUN chown -R pptruser:pptruser /usr/src/app

# 🔁 Switch back to the default non-root user
USER pptruser
RUN npm install --production --unsafe-perm

COPY . .

CMD ["node", "index.js"]

