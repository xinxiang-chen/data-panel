#!/bin/sh
# Switch the backend to a prebuilt image and restart the stack. Run on the server:
#   deploy/deploy.sh ghcr.io/<owner>/digital-twin-data-panel-backend:sha-<commit>
# CD (.github/workflows/deploy.yml) runs this after every backend change on main.
#
# The image is saved as BACKEND_IMAGE in deploy/.env, so manual compose commands
# keep using it. If the new backend does not become healthy, the previous image
# is restored. Note that a migration the new image already applied stays applied.
set -eu

image="${1:?usage: deploy.sh <image>}"
cd "$(dirname "$0")"
compose="docker compose -f docker-compose.prod.yml"

set_image() {
    if grep -q '^BACKEND_IMAGE=' .env; then
        sed -i.bak "s#^BACKEND_IMAGE=.*#BACKEND_IMAGE=$1#" .env && rm -f .env.bak # GNU + BSD sed
    else
        echo "BACKEND_IMAGE=$1" >>.env
    fi
}

# --wait returns once every service with a healthcheck is healthy, so a backend
# that fails its migration or /healthz fails the deploy.
start() {
    $compose up -d --no-build --remove-orphans --wait --wait-timeout 180
}

previous="$(sed -n 's/^BACKEND_IMAGE=//p' .env)"

echo "deploy: pulling $image"
docker pull --quiet "$image" # before touching .env, so a bad tag changes nothing

echo "deploy: starting"
set_image "$image"
if start; then
    echo "deploy: healthy on $image"
    docker image prune -f >/dev/null # drop old untagged images
    exit 0
fi

echo "deploy: $image did not become healthy" >&2
$compose logs --tail 50 backend >&2 || true
if [ -n "$previous" ] && [ "$previous" != "$image" ]; then
    echo "deploy: rolling back to $previous" >&2
    set_image "$previous"
    start || echo "deploy: rollback did not become healthy either" >&2
fi
exit 1
