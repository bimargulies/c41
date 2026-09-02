#!/usr/bin/env bash
#
# Standalone installer for the C41 UXP plugin on macOS, shipped alongside the
# .ccx on each GitHub release. It drives Adobe's UnifiedPluginInstallerAgent
# (UPIA), which is the same path the Creative Cloud desktop app uses when you
# double-click a .ccx - so it needs a Creative Cloud desktop app (5.7+) that is
# installed and signed in with an Adobe ID entitled to the plugin. It does not
# need this repo, node, or pnpm.
#
# Usage (run from the folder you downloaded the release files into):
#   bash install-ccx.sh                 install the .ccx sitting next to this script
#   bash install-ccx.sh path/to.ccx     install a specific .ccx
#   bash install-ccx.sh --remove        remove the installed plugin
#   bash install-ccx.sh --list          list installed UXP plugins for all Adobe apps

set -euo pipefail

plugin_name="C41 tools"   # matches "name" in the plugin manifest
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
	'')
		shopt -s nullglob
		ccxs=("$here"/*.ccx)
		shopt -u nullglob
		if [[ ${#ccxs[@]} -eq 0 ]]; then
			echo "error: no .ccx found next to this script - pass one as an argument" >&2
			exit 1
		elif [[ ${#ccxs[@]} -gt 1 ]]; then
			echo "error: more than one .ccx next to this script - pass the one you want:" >&2
			printf '  %s\n' "${ccxs[@]}" >&2
			exit 1
		fi
		ccx="${ccxs[0]}"
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
