#!/bin/bash

main() {
	setup
	main
}

setup() {
  git config --global user.email "travis@travis-ci.org"
  git config --global user.name "Travis CI"
}

push() {
  git remote set-url origin https://${GH_TOKEN}@github.com/jasonholloway/kharai.git > /dev/null 2>&1
  git push --quiet origin
}

main
