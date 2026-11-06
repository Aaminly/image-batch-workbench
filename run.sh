#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then echo '请先运行 ./setup.sh'; exit 1; fi
exec .venv/bin/python launcher.py "$@"
