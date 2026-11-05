#!/bin/sh
cd "$(dirname "$0")"
(sleep 2; open http://127.0.0.1:8765) &
./run.sh
