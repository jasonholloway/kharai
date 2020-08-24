#!/bin/bash

source .env

while true; do
	node out/src/index.js
	sleep 20s
done

