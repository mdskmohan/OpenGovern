#!/usr/bin/env bash
# =============================================================================
# sync-from-datahub.sh
#
# Pulls the latest connector source code from DataHub upstream and repackages
# it as opengovern-connectors with all datahub.* imports renamed.
#
# Usage:
#   ./scripts/sync-from-datahub.sh                  # sync from master
#   ./scripts/sync-from-datahub.sh --ref v0.13.0    # sync specific tag
#   ./scripts/sync-from-datahub.sh --dry-run        # show changes only
#
# What it does:
#   1. Sparse-clones only metadata-ingestion/src from DataHub (fast, ~50MB)
#   2. Copies connector source files to our package
#   3. Renames all datahub.* imports -> opengovern_connectors.*
#   4. Prints a summary of what changed
#
# After running:
#   - Review the diff: git diff ingestion/opengovern_connectors/
#   - Run tests: cd ingestion && pytest tests/unit/
#   - Commit and push
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"
TARGET_DIR="$REPO_ROOT/ingestion/opengovern_connectors/src/opengovern_connectors"
DATAHUB_REPO="https://github.com/datahub-project/datahub.git"
TMP_DIR="$(mktemp -d)"
REF="master"
DRY_RUN=false

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --ref) REF="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  OpenGovern Connector Sync from DataHub Upstream"
echo "  Ref: $REF"
echo "  Target: $TARGET_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

trap 'rm -rf "$TMP_DIR"' EXIT

# ── Step 1: Sparse clone DataHub ──────────────────────────────────────────────
echo ""
echo "▶ Cloning DataHub metadata-ingestion (sparse, ref=$REF)..."

git clone \
    --depth=1 \
    --filter=blob:none \
    --sparse \
    --branch "$REF" \
    "$DATAHUB_REPO" \
    "$TMP_DIR/datahub" 2>&1 | grep -v "^Cloning\|^remote:" || true

cd "$TMP_DIR/datahub"
git sparse-checkout set \
    metadata-ingestion/src/datahub/ingestion \
    metadata-ingestion/src/datahub/metadata \
    metadata-ingestion/src/datahub/utilities \
    metadata-ingestion/src/datahub/emitter

COMMIT_SHA=$(git rev-parse --short HEAD)
COMMIT_DATE=$(git log -1 --format="%ci" | cut -d' ' -f1)
echo "  ✓ DataHub commit: $COMMIT_SHA ($COMMIT_DATE)"

# ── Step 2: Count what we're syncing ─────────────────────────────────────────
SOURCE_DIR="$TMP_DIR/datahub/metadata-ingestion/src/datahub"
FILE_COUNT=$(find "$SOURCE_DIR" -name "*.py" | wc -l | tr -d ' ')
echo "  ✓ Found $FILE_COUNT Python files to sync"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "DRY RUN — no files written. Remove --dry-run to apply."
    echo ""
    echo "Files that would be updated:"
    find "$SOURCE_DIR/ingestion/source" -name "*.py" | head -20
    exit 0
fi

# ── Step 3: Copy source files ─────────────────────────────────────────────────
echo ""
echo "▶ Copying connector source files..."

# Copy ingestion layer (sources, sinks, API, transforms)
cp -r "$SOURCE_DIR/ingestion/." "$TARGET_DIR/ingestion/" 2>/dev/null || true
# Copy metadata models (schema definitions)
cp -r "$SOURCE_DIR/metadata/." "$TARGET_DIR/metadata/" 2>/dev/null || true
# Copy utilities
cp -r "$SOURCE_DIR/utilities/." "$TARGET_DIR/utilities/" 2>/dev/null || true
# Copy emitter base classes
cp -r "$SOURCE_DIR/emitter/." "$TARGET_DIR/emitter/" 2>/dev/null || true

echo "  ✓ Files copied"

# ── Step 4: Rename all datahub imports -> opengovern_connectors ───────────────
echo ""
echo "▶ Renaming imports datahub.* → opengovern_connectors.*..."

find "$TARGET_DIR" -name "*.py" -exec sed -i'' \
    -e 's/from datahub\./from opengovern_connectors./g' \
    -e 's/import datahub\./import opengovern_connectors./g' \
    -e 's/from datahub import/from opengovern_connectors import/g' \
    -e "s/'datahub\./'opengovern_connectors./g" \
    -e 's/"datahub\./"opengovern_connectors./g' \
    {} \;

RENAMED=$(find "$TARGET_DIR" -name "*.py" -exec grep -l "opengovern_connectors" {} \; | wc -l | tr -d ' ')
echo "  ✓ Renamed imports in $RENAMED files"

# ── Step 5: Write sync metadata ───────────────────────────────────────────────
cat > "$TARGET_DIR/.sync-metadata.json" << EOF
{
  "datahub_commit": "$COMMIT_SHA",
  "datahub_ref": "$REF",
  "sync_date": "$COMMIT_DATE",
  "synced_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "file_count": $FILE_COUNT
}
EOF

# ── Step 6: Summary ───────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Sync complete"
echo ""
echo "  DataHub commit : $COMMIT_SHA"
echo "  Files synced   : $FILE_COUNT"
echo "  Package        : opengovern-connectors 1.0.0"
echo ""
echo "  Next steps:"
echo "    1. Review: git diff ingestion/opengovern_connectors/"
echo "    2. Test:   cd ingestion && pip install -e opengovern_connectors/ && pytest tests/"
echo "    3. Commit: git add -A && git commit -m 'chore(connectors): sync from DataHub $COMMIT_SHA'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
