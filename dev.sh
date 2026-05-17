#!/bin/bash
export PATH="$(dirname "$0")/.node/bin:$PATH"
exec npm run dev
