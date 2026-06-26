# MeshCore Ninja — build orchestration for the static web app and the Go API.
#
# Run `make` (or `make help`) to list targets.

# --- config ------------------------------------------------------------------

API_DIR    := api
API_BIN    := $(API_DIR)/bin/meshcore-ninja-api
API_ADDR   ?= :8089
DATA_DIR   ?= data
GO         ?= go
NPM        ?= npm
REMOTE     ?= origin
RELEASE_BRANCH ?= main
RELEASE_VERSION := $(patsubst v%,%,$(VERSION))

# Pretty-print: every target with a `## comment` shows up in `make help`.
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# --- combined ----------------------------------------------------------------

.PHONY: build
build: build-api build-web ## Build both the Go API and the static web app

.PHONY: test
test: test-api test-web ## Run all tests (Go + data validation)

.PHONY: clean
clean: clean-api clean-web ## Remove all build artifacts

.PHONY: release
release: ## Check, commit, tag, and push a release, for example make release VERSION=v2026.6.0
	@test -n "$(VERSION)" || { \
		echo "Missing VERSION. Example: make release VERSION=v2026.6.0"; \
		exit 1; \
	}
	@echo "$(VERSION)" | grep -Eq '^v20[0-9]{2}\.([1-9]|1[0-2])\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$$' || { \
		echo "Invalid VERSION: $(VERSION). Expected CalVer format: v2026.6.0"; \
		exit 1; \
	}
	@test "$$(git branch --show-current)" = "$(RELEASE_BRANCH)" || { \
		echo "Release must be created from the $(RELEASE_BRANCH) branch"; \
		exit 1; \
	}
	@test -z "$$(git status --porcelain)" || { \
		echo "Working tree is not clean"; \
		exit 1; \
	}
	@git fetch --quiet $(REMOTE) $(RELEASE_BRANCH) --tags
	@test "$$(git rev-parse HEAD)" = "$$(git rev-parse $(REMOTE)/$(RELEASE_BRANCH))" || { \
		echo "Local $(RELEASE_BRANCH) is not synchronized with $(REMOTE)/$(RELEASE_BRANCH)"; \
		exit 1; \
	}
	@! git rev-parse "$(VERSION)" >/dev/null 2>&1 || { \
		echo "Tag $(VERSION) already exists"; \
		exit 1; \
	}
	$(NPM) version --no-git-tag-version "$(RELEASE_VERSION)"
	$(MAKE) --no-print-directory fmt tidy
	$(MAKE) --no-print-directory vet test build
	git add -u
	git commit -m "chore: release $(VERSION)"
	git tag -a "$(VERSION)" -m "meshcore-ninja $(VERSION)"
	git push $(REMOTE) "$(RELEASE_BRANCH)" "$(VERSION)"
	@echo "Released $(VERSION). GitHub Actions will publish the release and API image."

# --- web (SvelteKit) ---------------------------------------------------------

node_modules: package.json package-lock.json
	$(NPM) ci
	@touch node_modules

.PHONY: install
install: node_modules ## Install web dependencies (npm ci)

.PHONY: dev
dev: node_modules ## Run the web dev server (vite)
	VITE_API_BASE=http://localhost$(API_ADDR) $(NPM) run dev 

.PHONY: build-web
build-web: node_modules ## Build the static site into build/
	$(NPM) run build

.PHONY: preview
preview: node_modules ## Preview the production web build
	$(NPM) run preview

.PHONY: data
data: node_modules ## Regenerate data.json / schema from data/ YAML
	$(NPM) run build:data

.PHONY: test-web
test-web: node_modules ## Validate all YAML against the schema
	$(NPM) test

.PHONY: clean-web
clean-web: ## Remove web build output
	rm -rf build .svelte-kit

# --- Go API ------------------------------------------------------------------

# Build version stamped into meshcore_build_info (falls back to git describe).
API_VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

.PHONY: build-api
build-api: ## Compile the Go API to api/bin/
	cd $(API_DIR) && $(GO) build -ldflags "-X main.version=$(API_VERSION)" -o bin/meshcore-ninja-api .

.PHONY: run-api
run-api: ## Run the Go API (override DATA_DIR/API_ADDR as needed)
	cd $(API_DIR) && $(GO) run . --data ../$(DATA_DIR) --addr $(API_ADDR)

.PHONY: test-api
test-api: ## Run Go tests
	cd $(API_DIR) && $(GO) test ./...

.PHONY: vet
vet: ## Run go vet on the API
	cd $(API_DIR) && $(GO) vet ./...

.PHONY: fmt
fmt: ## Format the Go code
	cd $(API_DIR) && $(GO) fmt ./...

.PHONY: tidy
tidy: ## Tidy the Go module
	cd $(API_DIR) && $(GO) mod tidy

.PHONY: clean-api
clean-api: ## Remove the compiled API binary
	rm -rf $(API_DIR)/bin
