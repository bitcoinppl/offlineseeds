# development server
dev: dev-stop
    npm run dev

# stop any existing astro development server
[private]
dev-stop:
    npx --no-install astro dev stop

# build the site
build: install
    npm run build

# install dependencies
install:
    npm install

# update all dependencies
update:
    npm update

# deploy to cloudflare workers
deploy: build
    npx --yes wrangler deploy

# deploy preview to cloudflare workers (optional: just preview <subdomain>)
preview subdomain="": build
    #!/usr/bin/env bash
    name="{{ subdomain }}"
    if [ -z "$name" ]; then
        name=$(git branch --show-current | tr '/' '-' | tr '[:upper:]' '[:lower:]')
    fi
    npx --yes wrangler versions upload --preview-alias "$name"

# format all code
[group('format')]
@fmt:
    npm run format
