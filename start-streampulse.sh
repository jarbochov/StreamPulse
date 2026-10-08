#!/usr/bin/env bash
# Starts StreamPulse. Run from anywhere: ./start-streampulse.sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js was not found. Install it from https://nodejs.org and run this again."
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install || { echo "npm install failed."; exit 1; }
fi

if [ ! -f config.json ] && [ -f config.example.json ]; then
    cp config.example.json config.json
    echo "Created config.json from config.example.json. Add your details at http://localhost:3000/config-editor.html"
fi

echo "Starting StreamPulse..."
exec node server.js
