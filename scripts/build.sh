#!/bin/sh
rm -rf out
npm test
npm version minor
npm publish --access=public
