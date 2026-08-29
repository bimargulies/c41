#!/usr/bin/env bash
#
# Install the C41 UXP plugin into Photoshop on macOS via Adobe's
# UnifiedPluginInstallerAgent, bypassing the Creative Cloud Desktop
# double-click flow. Useful when that flow wrongly reports
# "you do not have a compatible version of Photoshop installed".
#
# Usage:
#   scripts/install-macos.sh                 build, package dist/ into a .ccx, and install it
#   scripts/install-macos.sh path/to.ccx     install an existing .ccx
#   scripts/install-macos.sh --remove        remove the installed plugin
#   scripts/install-macos.sh --list          list installed UXP plugins for all Adobe apps
#
# Requirements:
#   - Creative Cloud desktop app 5.7 or newer
#   - Signed in with the Adobe ID entitled to the plugin
#   - pnpm + zip on PATH (only for the build/package path)

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_name="C41 tools"   # must match "name" in uxp.config.ts
agent="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent"

if [[ ! -x "$agent" ]]; then
	echo "error: UnifiedPluginInstallerAgent not found at:" >&2
	echo "  $agent" >&2
	echo "Install or update the Creative Cloud desktop app (5.7+) and retry." >&2
	exit 1
fi

case "${1:-}" in
	--list)
		exec "$agent" --list all
		;;
	--remove)
		exec "$agent" --remove "$plugin_name"
		;;
esac

ccx="${1:-}"

if [[ -z "$ccx" ]]; then
	echo "==> Building"
	(cd "$repo_root" && pnpm build)

	ccx="$repo_root/c41.ccx"
	echo "==> Packaging $ccx"
	rm -f "$ccx"
	# A .ccx is a plain zip of the built plugin with manifest.json at the root.
	(cd "$repo_root/dist" && zip -q -r -X "$ccx" . -x '*.ccx')
fi

if [[ ! -f "$ccx" ]]; then
	echo "error: no such file: $ccx" >&2
	exit 1
fi

echo "==> Installing $ccx"
"$agent" --install "$ccx"

echo "==> Installed plugins"
"$agent" --list all || true

echo
echo "Done. Restart Photoshop if it was running."
