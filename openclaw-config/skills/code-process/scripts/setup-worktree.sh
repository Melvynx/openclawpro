#!/bin/bash
set -e

FEATURE_NAME="${1:-feature}"
SOURCE_DIR="${2:-.}"
WORKTREE_DIR=".clawd-project"
WORKTREE_PATH="${WORKTREE_DIR}/${FEATURE_NAME}"
BRANCH_NAME="feature/${FEATURE_NAME}"

mkdir -p "${WORKTREE_DIR}"

if [ -d "${WORKTREE_PATH}" ]; then
    echo "Worktree already exists at ${WORKTREE_PATH}"
    exit 1
fi

git worktree add -b "${BRANCH_NAME}" "${WORKTREE_PATH}" 2>/dev/null || \
git worktree add "${WORKTREE_PATH}" "${BRANCH_NAME}"

for env_file in "${SOURCE_DIR}"/.env*; do
    [ -f "$env_file" ] && cp "$env_file" "${WORKTREE_PATH}/"
done

cd "${WORKTREE_PATH}"
if [ -f "package.json" ]; then
    bun install 2>/dev/null || pnpm install 2>/dev/null || yarn install 2>/dev/null || npm install
elif [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
elif [ -f "Gemfile" ]; then
    bundle install
elif [ -f "go.mod" ]; then
    go mod download
fi

echo "Worktree ready at: ${WORKTREE_PATH}"
echo "Branch: ${BRANCH_NAME}"
