#!/bin/bash

# Playwright MCP Server Docker Compose Startup Script

set -e

echo "🚀 Starting Playwright MCP Server with Caddy Docker Proxy..."

# Check if caddy network exists
if ! docker network ls | grep -q "caddy"; then
    echo "❌ Caddy network not found. Creating external caddy network..."
    docker network create caddy
    echo "✅ Caddy network created."
else
    echo "✅ Caddy network found."
fi

# Load environment variables
if [ -f .env ]; then
    echo "📋 Loading environment variables from .env"
    export $(cat .env | xargs)
else
    echo "❌ .env file not found!"
    exit 1
fi

echo "🏗️  Building and starting services..."
docker-compose up --build -d

echo "⏳ Waiting for service to be healthy..."
sleep 10

# Check if service is running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Playwright MCP Server is running!"
    echo "🌐 Available at: https://${DOMAIN}"
    echo "🔗 MCP Endpoint: https://${DOMAIN}/mcp"
    echo "🔗 SSE Endpoint: https://${DOMAIN}/sse"
    echo ""
    echo "📋 Client configuration:"
    echo "{"
    echo "  \"mcpServers\": {"
    echo "    \"playwright\": {"
    echo "      \"url\": \"https://${DOMAIN}/mcp\""
    echo "    }"
    echo "  }"
    echo "}"
    echo ""
    echo "🎬 Video recording tools are available:"
    echo "  - browser_start_recording"
    echo "  - browser_stop_recording" 
    echo "  - browser_recording_status"
else
    echo "❌ Failed to start service"
    docker-compose logs
fi