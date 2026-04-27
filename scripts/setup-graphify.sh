#!/bin/bash
# Auto-install graphify with available Python tooling
if command -v uv &>/dev/null; then
  uv tool install graphifyy 2>/dev/null || true
elif command -v pipx &>/dev/null; then
  pipx install graphifyy 2>/dev/null || true
elif command -v pip3 &>/dev/null; then
  pip3 install --user graphifyy 2>/dev/null || true
else
  echo "⚠️  graphify: Python not found, skipping"
  exit 0
fi

command -v graphify &>/dev/null || { echo "⚠️  graphify not in PATH"; exit 0; }

graphify hook install
graphify update .
graphify claude install
echo "✓ graphify ready"
