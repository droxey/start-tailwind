# Fire Sale image for CapRover. The build context is the repository root.
# CSS is compiled in the image because public/assets/site.css is not committed.
# The running app has no npm packages. It uses Node's built-in modules only.

FROM node:24.21.0-bookworm-slim AS css

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY .tailwind-version .tailwind-version
COPY scripts/get-tailwind.sh scripts/get-tailwind.sh
RUN sh scripts/get-tailwind.sh

# These two plugins are build tools, pinned to the versions in package.json.
# The repo lockfile is not installed here.
RUN npm install --no-package-lock --no-save \
  @tailwindcss/forms@0.5.11 \
  @tailwindcss/typography@0.5.20

COPY src src
COPY public public
RUN ./bin/tailwindcss -i src/input.css -o public/assets/site.css --minify

FROM node:24.21.0-bookworm-slim

WORKDIR /app
COPY server server
COPY --from=css /src/public public

RUN mkdir -p /srv/fire-sale/data && chown -R node:node /srv/fire-sale /app

# Container port only. Do not publish 8080 on the host.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    FIRE_SALE_DATA=/srv/fire-sale/data

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
