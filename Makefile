PATH  := node_modules/.bin:$(PATH)
SHELL := /bin/bash

.ONESHELL:
.PHONY: clean test build


build: out/built

test: out/tested

clean:
	rm -rf out


node_modules: package.json
	npm install

out/built: $(shell find src tests) tsconfig.json node_modules Makefile
	tsc \
	&& touch out/built

out/tested: out/built jest.config.js
	jest \
	  --collectCoverage=true \
	  --coverageProvider=v8 \
	&& touch out/tested

publish: out/tested
	if [ ! -z "$$(git status --porcelain)" ]; then
	  echo "Git not clean!"
	  exit 1
	fi

	version=$$(awk '/^\W*"version":/ { print gensub(/\"(.+)\",/, "v\\1", "g", $$2) }' package.json)
	tags=$$(git tag -l --points-at=HEAD)

	if (echo $$tags | grep $$version); then
	  echo '//registry.npmjs.org/:_authToken=$${NPM_TOKEN}' > .npmrc
	  npm publish
	fi

