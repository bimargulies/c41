#!/usr/bin/env bash
#
# Build, package, and install the C41 UXP plugin into Photoshop on macOS via
# Adobe's UnifiedPluginInstallerAgent (also --package / --remove / --list).
#
# The agent forwards to the Creative Cloud desktop app, so this can't get
# around a broken CCD install. It has fixed the "status = -267 / failed to
# generate mxi" failure though: `pnpm package` (used here) collapses the
# manifest's single-host array to an object, which the CCD installer needs.
# See the README's "When .ccx installation fails" section.
#
# Usage:
#   scripts/install-macos.sh                 build + package + install
#   scripts/install-macos.sh path/to.ccx     install an existing .ccx
#   scripts/install-macos.sh --package       build + package only (writes ./c41.ccx)
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
ccx="$repo_root/c41.ccx"
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
	--package)
		exec pnpm --dir "$repo_root" run package "$ccx"
		;;
	'')
		pnpm --dir "$repo_root" run package "$ccx"
		;;
	*)
		ccx="$1"
		;;
esac

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
