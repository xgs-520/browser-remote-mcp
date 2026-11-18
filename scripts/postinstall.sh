#!/bin/bash
# postinstall: patch SDK protocol version + install browser kernel
# Runs automatically after `npm install`

echo "=== browser-remote-mcp postinstall ==="

# 1. Patch SDK to support MCP protocol 2026-07-28
#    SDK 1.32.2 only supports up to 2025-11-25; we add 2026-07-28 to the list
TYPES_ESM="node_modules/@modelcontextprotocol/sdk/dist/esm/types.js"
TYPES_CJS="node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js"

for f in "$TYPES_ESM" "$TYPES_CJS"; do
  if [ -f "$f" ]; then
    # Check if already patched
    if grep -q "2026-07-28" "$f"; then
      echo "[SDK] Already patched for 2026-07-28, skipping."
    else
      # Add 2026-07-28 to SUPPORTED_PROTOCOL_VERSIONS and set as LATEST
      sed -i "s/'2025-11-25'/'2026-07-28'/g" "$f"
      sed -i "s/\[LATEST_PROTOCOL_VERSION, '\(.*\)'\]/[LATEST_PROTOCOL_VERSION, '2025-11-25', '\1']/g" "$f"
      sed -i "s/\[exports.LATEST_PROTOCOL_VERSION, '\(.*\)'\]/[exports.LATEST_PROTOCOL_VERSION, '2025-11-25', '\1']/g" "$f"
      echo "[SDK] Patched $f → added 2026-07-28 support."
    fi
  fi
done

# 2. Install browser kernel (best-effort, don't fail npm install if this fails)
echo "[Playwright] Installing chromium-headless-shell..."
npx playwright install chromium-headless-shell 2>&1 || echo "[Playwright] Warning: browser install failed. Run 'npx playwright install chromium-headless-shell' manually."

echo "=== postinstall done ==="
