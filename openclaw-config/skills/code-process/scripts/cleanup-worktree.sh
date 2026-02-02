#!/bin/bash
set -e

FEATURE_NAME="${1:-feature}"
DELETE_BRANCH="${2:-}"
WORKTREE_DIR=".clawd-project"
WORKTREE_PATH="${WORKTREE_DIR}/${FEATURE_NAME}"
BRANCH_NAME="feature/${FEATURE_NAME}"

if [ ! -d "${WORKTREE_PATH}" ]; then
    echo "Worktree not found at ${WORKTREE_PATH}"
    exit 1
fi

git worktree remove "${WORKTREE_PATH}" --force

if [ "${DELETE_BRANCH}" = "--delete-branch" ]; then
    git branch -D "${BRANCH_NAME}" 2>/dev/null || true
fi

rmdir "${WORKTREE_DIR}" 2>/dev/null || true
echo "Cleanup complete"
