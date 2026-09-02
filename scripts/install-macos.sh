#!/usr/bin/env bash
#
# Local-development convenience: build + package the C41 plugin and install it
# into Photoshop on macOS in one step. The actual install is delegated to
# install-ccx.sh (the same standalone installer shipped with releases), which
# drives Adobe's UnifiedPluginInstallerAgent.
#
# `pnpm run package` builds with vite-uxp-plugin's package mode, which collapses
# the manifest's single-host array to an object - the Creative Cloud installer
# needs that (see the README's "Why `pnpm run package`" section).
#
# Usage:
#   scripts/install-macos.sh                 build + package + install
#   scripts/install-macos.sh path/to.ccx     install an existing .ccx
#   scripts/install-macos.sh --package       build + package only (writes ./c41.ccx)
#   scripts/install-macos.sh --remove        remove the installed plugin
#   scripts/install-macos.sh --list          list installed UXP plugins for all Adobe apps
#
# Requirements:
#   - Creative Cloud desktop app 5.7 or newer, signed in with an entitled Adobe ID
#   - pnpm on PATH (only for the build/package paths)

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
ccx="$repo_root/c41.ccx"
installer="$script_dir/install-ccx.sh"

case "${1:-}" in
	--list | --remove)
		exec bash "$installer" "$1"
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

exec bash "$installer" "$ccx"
