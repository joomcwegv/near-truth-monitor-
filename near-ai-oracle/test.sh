#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export GVM_ROOT="$HOME/.gvm"
export PATH="$HOME/.gvm/gos/go1.25.4/bin:$HOME/.gvm/bin:/opt/homebrew/bin:$PATH"
export NEAR_GO="$HOME/bin/near-go"

echo "=== [yield-resume] Building ==="
"$NEAR_GO" build

echo ""
echo "=== [yield-resume] Unit tests ==="
"$NEAR_GO" test project

echo ""
echo "=== [yield-resume] Integration tests ==="
cargo test --manifest-path integration-tests/Cargo.toml

echo ""
echo "✓ All yield-resume tests passed"
