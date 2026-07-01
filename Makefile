# Local Windows release build (tests + .exe) with cached dependencies.
# Requires: bun, make (Git Bash / MSYS2 / WSL), Python 3.12 on PATH for first-time venv.
#
# Usage:
#   make help
#   make test              # fast loop (no PyInstaller / no installer)
#   make release-win       # tests + production build + NSIS .exe
#   make deps              # install only if node_modules / venv missing or stale
#
# Repo defaults: .env.local (copy from .env.local.example)
# Override on command line:
#   make release-win UPDATE_FEED_URL=https://github.com/aditya190803/audit-app/releases/download/v1.1.6

SHELL := /bin/sh
ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

VERSION := $(shell node -p "require('./package.json').version" 2>/dev/null || echo 0.0.0)

ifeq ($(OS),Windows_NT)
  VENV := $(ROOT).venv
  PY := $(VENV)/Scripts/python.exe
  PIP := $(VENV)/Scripts/pip.exe
  VENV_BIN := $(VENV)/Scripts
else
  VENV := $(ROOT).venv
  PY := $(VENV)/bin/python
  PIP := $(VENV)/bin/pip
  VENV_BIN := $(VENV)/bin
endif

VENV_STAMP := $(VENV)/.deps-installed
NODE_STAMP := $(ROOT)node_modules/.deps-installed

GITHUB_REPOSITORY ?= aditya190803/audit-app
UPDATE_FEED_URL ?= https://github.com/$(GITHUB_REPOSITORY)/releases/download/v$(VERSION)
LICENSE_CHECK_URL ?= https://the-ska-auditing-app.vercel.app/api/license
export GITHUB_REPOSITORY
export UPDATE_FEED_URL
export LICENSE_CHECK_URL
export ALLOW_UNSIGNED_RELEASE := 1
export RELEASE_PLATFORM := windows

.PHONY: help deps deps-node deps-python test test-backend release-win build-app clean-build info

help:
	@echo "Bank Audit App — local build"
	@echo ""
	@echo "  make deps          Install bun + Python deps only when needed (cached)"
	@echo "  make test          Typecheck + frontend smoke + backend pytest"
	@echo "  make test-backend  Backend pytest only"
	@echo "  make release-win   deps + tests + vite build + PyInstaller + .exe"
	@echo "  make build-app     Production artifacts only (assumes deps + tests already OK)"
	@echo "  make clean-build   Remove out/ and resources/python-dist/ (not node_modules/venv)"
	@echo ""
	@echo "  Version (package.json): $(VERSION)"
	@echo "  UPDATE_FEED_URL=$(UPDATE_FEED_URL)"

info:
	@echo "version=$(VERSION)"
	@echo "python=$(PY)"
	@test -x "$(PY)" && "$(PY)" --version || echo "venv not ready — run make deps"

# Implementation lives in scripts/local-release.js (also used without make on Windows).

deps:
	cd "$(ROOT)" && node scripts/local-release.js deps

deps-force:
	@rm -f "$(NODE_STAMP)" "$(VENV_STAMP)"
	@$(MAKE) deps

test:
	cd "$(ROOT)" && node scripts/local-release.js test

test-backend:
	cd "$(ROOT)" && node scripts/local-release.js test-backend

release-win:
	cd "$(ROOT)" && node scripts/local-release.js release-win

build-app:
	cd "$(ROOT)" && node scripts/local-release.js build-app

clean-build:
	rm -rf "$(ROOT)out" "$(ROOT)resources/python-dist"