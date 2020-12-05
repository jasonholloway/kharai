PATH	:= node_modules/.bin:$(PATH)
SHELL := /bin/bash

.ONESHELL:
.PHONY: clean test build


build: out

test: tests.json

clean:
	rm -rf out


node_modules: package.json
	npm install

out: $(shell find src tests) tsconfig.json node_modules
	tsc
	touch out/built

tests.json: out jest-ci.config.js
	jest -c jest-ci.config.js \
	  --json --outputFile=tests.json

publish: out tests.json
	if [ ! -z "$$(git status --porcelain)" ]; then
	  echo "Git not clean!"
	  exit 1
	fi

	version=$$(awk '/^\W*"version":/ { print gensub(/\"(.+)\",/, "v\\1", "g", $$2) }' package.json)
	tags=$$(git tag -l --points-at=HEAD)

	if (echo $$tags | grep $$version); then
		npm publish
	fi

