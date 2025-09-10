#!/bin/bash

# Playwright MCP Server Docker Compose Stop Script

set -e

echo "🛑 Stopping Playwright MCP Server..."

docker-compose down

echo "✅ Playwright MCP Server stopped."
echo "📁 Video recordings and output files are preserved in ./output/"