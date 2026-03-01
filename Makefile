.PHONY: help dev clean-dev build run check check-ts check-all release clean
.DEFAULT_GOAL := help

BUNDLE_ID = io.audioshift.desktop

help:
	@echo "Usage: make <command>"
	@echo ""
	@echo "Development:"
	@echo "  dev          Dev with hot reload"
	@echo "  clean-dev    Reset state + dev"
	@echo "  build        Production build"
	@echo "  run          Build + run (resets permissions)"
	@echo "  clean        Uninstall + wipe all data + reset permissions"
	@echo ""
	@echo "Checks:"
	@echo "  check        Rust check"
	@echo "  check-ts     TypeScript check"
	@echo "  check-all    All checks"
	@echo ""
	@echo "Release:"
	@echo "  release x.y.z   Bump version, commit, push, tag"

dev:
	pnpm tauri dev

clean-dev:
	-pkill -f AudioShift
	-tccutil reset Microphone $(BUNDLE_ID)
	-tccutil reset Accessibility $(BUNDLE_ID)
	-rm -f "$(HOME)/Library/Application Support/$(BUNDLE_ID)/settings.json"
	-rm -f "$(HOME)/Library/Application Support/$(BUNDLE_ID)/history.json"
	-rm -rf "$(HOME)/Documents/AudioShift"
	pnpm tauri dev

build:
	pnpm tauri build

run: build
	-tccutil reset Microphone
	-tccutil reset Accessibility
	-rm -f "$(HOME)/Library/Application Support/$(BUNDLE_ID)/settings.json"
	-rm -f "$(HOME)/Library/Application Support/$(BUNDLE_ID)/history.json"
	-rm -rf "$(HOME)/Documents/AudioShift"
	open src-tauri/target/release/bundle/macos/AudioShift.app

clean:
	-osascript -e 'quit app "AudioShift"' 2>/dev/null; sleep 1
	-rm -rf /Applications/AudioShift.app
	-rm -rf "$(HOME)/Library/Application Support/$(BUNDLE_ID)"
	-rm -rf "$(HOME)/Library/Caches/$(BUNDLE_ID)"
	-rm -rf "$(HOME)/Library/Caches/audioshift"
	-rm -rf "$(HOME)/Library/Preferences/audioshift.plist"
	-rm -rf "$(HOME)/Library/WebKit/$(BUNDLE_ID)"
	-rm -rf "$(HOME)/Library/WebKit/audioshift"
	-tccutil reset Accessibility $(BUNDLE_ID)
	-tccutil reset Microphone $(BUNDLE_ID)
	-tccutil reset SystemPolicyDocumentsFolder $(BUNDLE_ID)
	-tccutil reset SystemPolicyDocumentsFolder
	@echo "Clean slate done"

check:
	cargo check --manifest-path src-tauri/Cargo.toml

check-ts:
	npx tsc --noEmit

check-all: check check-ts

# Release: make release 1.0.3 (bumps version, amends last commit, force pushes, tags)
release:
	$(eval V := $(filter-out $@,$(MAKECMDGOALS)))
	@if [ -z "$(V)" ]; then echo "Usage: make release x.y.z"; exit 1; fi
	sed -i '' 's/"version": "[^"]*"/"version": "$(V)"/' package.json
	sed -i '' 's/"version": "[^"]*"/"version": "$(V)"/' src-tauri/tauri.conf.json
	sed -i '' 's/^version = "[^"]*"/version = "$(V)"/' src-tauri/Cargo.toml
	cargo update --manifest-path src-tauri/Cargo.toml --workspace
	sed -i '' 's/AudioShift v[0-9][0-9.]*/AudioShift v$(V)/' src/components/Settings.tsx
	sed -i '' 's/v[0-9][0-9.]*/v$(V)/' src/components/settings/AboutPage.tsx
	git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock src/components/Settings.tsx src/components/settings/AboutPage.tsx
	git commit -m "v$(V)"
	git push
	git tag v$(V)
	git push origin v$(V)
	@echo "Released v$(V) — workflow triggered"

%:
	@:
