#!/bin/zsh
# Double-clique ce fichier dans le Finder pour lancer Taupe.
cd "$(dirname "$0")"
export UV_THREADPOOL_SIZE=32
exec node --max-old-space-size=8192 server.mjs "$@"

