.PHONY: help setup env install db db-stop db-reset migrate seed user api worker web dev kill-worker

# Directories
BE_DIR := eval_platform_be
FE_DIR := eval_platform_fe

# Ports. The frontend's VITE_API_URL defaults to http://localhost:4000, and
# vite.config.ts pins the dev server to 3000 (strictPort).
API_PORT := 4000
WEB_PORT := 3000

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────

env: ## Copy .env.example files (won't overwrite existing)
	@test -f $(BE_DIR)/.env || cp $(BE_DIR)/.env.example $(BE_DIR)/.env
	@echo "  $(BE_DIR)/.env ready"
	@test -f $(FE_DIR)/.env || cp $(FE_DIR)/.env.example $(FE_DIR)/.env
	@echo "  $(FE_DIR)/.env ready"

install: ## Install dependencies (uv + bun)
	uv sync
	cd $(FE_DIR) && bun install

setup: env install db migrate seed ## Full first-time setup (env + install + db + migrate + seed)
	@echo ""
	@echo "Setup complete. Fill in the API keys in $(BE_DIR)/.env, create an account with 'make user', then run 'make dev'."

# ──────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────

db: ## Start PostgreSQL (port 5436) + Redis (port 6380)
	docker compose up -d --wait

db-stop: ## Stop PostgreSQL + Redis (data is kept)
	docker compose down

db-reset: ## Wipe the database and Redis, then migrate + seed again
	docker compose down -v
	$(MAKE) db migrate seed

migrate: ## Apply Alembic migrations
	cd $(BE_DIR) && uv run alembic upgrade head

seed: ## Seed a scenario + test case (usage: make seed [u=<username>])
	cd $(BE_DIR) && uv run python -m app.seed $(if $(u),--user $(u))

user: ## Create an account; asks for the details (make user role=superuser|admin)
	cd $(BE_DIR) && uv run python -m app.create_user $(if $(role),--$(role))

# ──────────────────────────────────────────────
# Run
# ──────────────────────────────────────────────

api: ## Start the API on port 4000
	cd $(BE_DIR) && uv run uvicorn app.main:app --reload --port $(API_PORT)

# Celery's default prefork pool doesn't work on Windows, so use threads: each
# task calls asyncio.run in its own thread, so runs don't share an event loop.
# c = how many runs at once (make worker c=2). Every run is a live call plus TTS
# and LLM requests, so Cartesia/Anthropic rate limits cap this before the CPU does.
c ?= 5

worker: ## Start the Celery worker, c runs at once (default 5; make worker c=2)
	cd $(BE_DIR) && uv run celery -A app.worker worker -P threads -c $(c) -l info

web: ## Start the frontend dev server (port 3000)
	cd $(FE_DIR) && bun run dev

dev: ## Start API, worker, and frontend together (requires 'make db')
	@echo "Starting API, worker, and web in parallel..."
	@echo "  API    -> http://localhost:$(API_PORT)"
	@echo "  Worker -> Celery (redis://localhost:6380, queue eval_api)"
	@echo "  Web    -> http://localhost:$(WEB_PORT)"
	@echo "  Press Ctrl+C to stop all."
	@$(MAKE) -j3 api worker web

# Windows has no pkill, so ask PowerShell for every celery/python/uv process
# whose command line runs this app's worker. Matching on the name too keeps it
# from killing the shell that is running this very command.
CELERY_PROCS := Get-CimInstance Win32_Process | Where-Object { $$_.Name -in 'celery.exe','python.exe','uv.exe' -and $$_.CommandLine -match 'celery.*app\.worker.*worker' }

kill-worker: ## Kill a leftover Celery worker (e.g. after Ctrl+C on 'make dev')
	@powershell -NoProfile -Command "$$p = @($(CELERY_PROCS)); if (-not $$p) { 'No Celery worker running.' } else { $$p | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue; '  killed ' + $$_.ProcessId + ' ' + $$_.Name } }"
