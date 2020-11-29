#!/bin/sh
rm -rf out
node_modules/.bin/tsc
node_modules/.bin/jest
