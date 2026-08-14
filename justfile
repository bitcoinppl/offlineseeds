# development server
dev: dev-stop
    npm run dev

# stop leftover astro and rescript watchers from this project
[private]
dev-stop:
    #!/usr/bin/env bash
    set -u
    npx --no-install astro dev stop || true
    pkill -f "{{justfile_directory()}}/node_modules/.bin/concurrently" || true
    pkill -f "{{justfile_directory()}}/node_modules/.bin/rescript" || true
    pkill -f "{{justfile_directory()}}/node_modules/@rescript/.*/bin/rescript.exe" || true
    rm -f "{{justfile_directory()}}/lib/watch.lock"

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
