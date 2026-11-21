#!/usr/bin/env bash
# Install a pinned public Helix release using micro1's HTTPS release metadata.
set -euo pipefail

version=${1:?usage: install_helix.sh VERSION [INSTALL_DIR]}
install_dir=${2:-/usr/local/bin}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo 'Expected a stable Helix version, such as 0.1.3.' >&2
  exit 1
}
case "$(uname -m)" in
  x86_64|amd64) arch=x86_64 ;;
  aarch64|arm64) arch=aarch64 ;;
  *) echo 'Unsupported Helix image architecture.' >&2; exit 1 ;;
esac
[[ "$(uname -s)" == Linux ]] || exit 1

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
prefix="https://helix.micro1.ai/cli/releases/releases/$version/stable/linux/$arch"
fetch() {
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --silent --show-error --location --connect-timeout 10 --max-time 240 \
    "$1" -o "$2"
}
fetch "$prefix/helix.url" "$work/helix.url"
binary_url=$(cat "$work/helix.url")
case "$binary_url" in
  https://artifactregistry.googleapis.com/download/v1/projects/*/locations/*/repositories/*/files/*:download\?alt=media) ;;
  *) echo 'Unexpected public Helix binary origin.' >&2; exit 1 ;;
esac
fetch "$binary_url" "$work/helix"
fetch "$prefix/helix.sha256" "$work/helix.sha256"
expected=$(cat "$work/helix.sha256")
[[ "$expected" =~ ^[0-9a-f]{64}\ \ helix$ ]] || {
  echo 'Unexpected Helix checksum record.' >&2
  exit 1
}
(cd "$work" && sha256sum --check helix.sha256)
chmod 0755 "$work/helix"
[[ "$("$work/helix" --version)" == "helix $version" ]]
install -d "$install_dir"
install -m 0755 "$work/helix" "$install_dir/helix"
"$install_dir/helix" task author --help >/dev/null
"$install_dir/helix" task zip --help >/dev/null
