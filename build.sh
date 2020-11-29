#!/bin/sh
rm -rf out
npm i
npx tsc
npx jest
