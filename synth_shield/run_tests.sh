#!/usr/bin/env bash
# Run the full SynthShield backend test suite.
# Usage: bash run_tests.sh [extra pytest args]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"

echo "=== SynthShield — backend test suite ==="
echo "Backend dir: $BACKEND"
echo ""

cd "$BACKEND"

# Run pytest from inside backend/ so conftest.py on sys.path works
python -m pytest tests/ -v --tb=short "$@"
