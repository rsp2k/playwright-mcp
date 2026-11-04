.PHONY: up down restart logs status build rebuild shell health smoke

# Default target: show what's available.
help:
	@echo "playwright-mcp docker stack"
	@echo ""
	@echo "  make build    — build the image (first time, or after Dockerfile changes)"
	@echo "  make up       — start the stack in the background"
	@echo "  make down     — stop and remove containers"
	@echo "  make restart  — restart (picks up new lib/ from host-side npm run build)"
	@echo "  make logs     — follow container logs"
	@echo "  make status   — show container state and health"
	@echo "  make health   — exec the healthcheck once and report"
	@echo "  make shell    — interactive shell inside the running container"
	@echo "  make smoke    — curl the /mcp endpoint via caddy to confirm end-to-end"
	@echo "  make rebuild  — rebuild image from scratch (no cache)"

build:
	docker compose build

up:
	docker compose up -d
	@echo ""
	@echo "Stack up. Follow logs with: make logs"
	@echo "Smoke test with:            make smoke"

down:
	docker compose down

restart:
	docker compose restart playwright-mcp

logs:
	docker compose logs -f --tail=100 playwright-mcp

status:
	@docker compose ps
	@echo ""
	@docker inspect --format='Health: {{.State.Health.Status}}' playwright-mcp 2>/dev/null || true

health:
	@docker exec playwright-mcp node -e "require('http').get('http://127.0.0.1:8931/mcp',r=>{console.log('status',r.statusCode);process.exit(0)}).on('error',e=>{console.error(e.message);process.exit(1)})"

shell:
	docker exec -it playwright-mcp /bin/bash

smoke:
	@set -a; . ./.env; set +a; \
	echo "Hitting https://$$DOMAIN/mcp (expect 400 Invalid request from GET without session)…"; \
	curl -sS -o /dev/null -w "HTTP %{http_code}\n" "https://$$DOMAIN/mcp"

rebuild:
	docker compose build --no-cache
