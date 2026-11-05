#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v pngquant >/dev/null || { echo '请先安装 pngquant（macOS: brew install pngquant）'; exit 1; }
command -v uv >/dev/null || { echo '请先安装 uv: https://docs.astral.sh/uv/'; exit 1; }
if [ ! -x .venv/bin/python ]; then uv venv --python 3.11 .venv; fi
uv pip install --python .venv/bin/python -r requirements.txt
U2NET_HOME="$PWD/.models" .venv/bin/python -c 'from rembg import new_session; new_session("birefnet-general", providers=["CPUExecutionProvider"]); print("本地模型准备完成")'
