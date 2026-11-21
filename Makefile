.PHONY: up down restart logs status build rebuild shell health smoke install-systemd uninstall-systemd

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
	@echo ""
	@echo "  make install-systemd    — install user systemd unit so the stack starts at login/boot"
	@echo "  make uninstall-systemd  — stop, disable, and remove the user systemd unit"

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

install-systemd:
	@install -D deploy/systemd/playwright-mcp.service "$$HOME/.config/systemd/user/playwright-mcp.service"
	@systemctl --user daemon-reload
	@systemctl --user enable --now playwright-mcp.service
	@echo ""
	@echo "User unit installed and enabled."
	@echo "  Status:  systemctl --user status playwright-mcp"
	@echo "  Logs:    journalctl --user -u playwright-mcp -f"
	@echo ""
	@echo "For the stack to start at boot WITHOUT requiring an interactive login,"
	@echo "run once (needs sudo):"
	@echo "  sudo loginctl enable-linger $$USER"

uninstall-systemd:
	@systemctl --user disable --now playwright-mcp.service 2>/dev/null || true
	@rm -f "$$HOME/.config/systemd/user/playwright-mcp.service"
	@systemctl --user daemon-reload
	@echo "User unit disabled and removed. (loginctl linger left untouched.)"
