---
name: step-05-cleanup
description: Cleanup worktree after PR is merged
prev_step: null
next_step: null
---

# Step 5: Cleanup

## MANDATORY EXECUTION RULES (READ FIRST):

- 🛑 NEVER cleanup before PR is merged
- 🛑 NEVER delete branch if it has unmerged commits
- ✅ ALWAYS verify PR status before cleanup
- ✅ ALWAYS use --force for worktree removal
- 📋 YOU ARE A CLEANER, not an implementer
- 💬 FOCUS on cleanup only
- 🚫 FORBIDDEN to cleanup active work

## EXECUTION PROTOCOLS:

- 🎯 Verify PR is merged, then remove worktree and branch
- 💾 Clean up cron job if still exists
- 📖 Confirm all cleanup complete
- 🚫 FORBIDDEN to cleanup if work is in progress

## CONTEXT BOUNDARIES:

- Input: `{feature_name}` from arguments
- Derives: `{worktree_path}`, `{branch_name}` from feature_name
- This is a standalone step, called manually after merge

## YOUR TASK:

Clean up the worktree and branch after the PR has been merged.

---

## INVOCATION

This step is called separately after PR is merged:

```
/code-process cleanup <feature-name>
```

---

## EXECUTION SEQUENCE:

### 1. Parse Feature Name

```
{feature_name} = argument
{worktree_root} = ${OPENCLAW_ROOT:-.}/.openclaw/code-projects
{worktree_path} = {worktree_root}/{feature_name}
{branch_name} = feature/{feature_name}
```

### 2. Verify Worktree Exists

```bash
if [ ! -d "{worktree_path}" ]; then
  echo "⚠️ Worktree not found: {worktree_path}"
  echo "Nothing to cleanup."
  exit 0
fi
```

### 3. Check for Uncommitted Work

```bash
cd "{worktree_path}"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️ Worktree has uncommitted changes!"
  git status --short

  # Ask user to confirm
  echo ""
  echo "Continue with cleanup? Uncommitted changes will be lost."
fi
```

**Use AskUserQuestion if uncommitted changes exist:**
```yaml
questions:
  - header: "Confirm"
    question: "Worktree has uncommitted changes. Proceed with cleanup?"
    options:
      - label: "Yes, cleanup anyway"
        description: "Discard changes and remove worktree"
      - label: "No, keep worktree"
        description: "Cancel cleanup"
    multiSelect: false
```

### 4. Check PR Status

```bash
# Get target repo
TARGET_REPO=$(cd "{worktree_path}" && gh repo view --json nameWithOwner -q .nameWithOwner)

# Check if PR exists and is merged
gh pr list --repo "${TARGET_REPO}" --head "{branch_name}" --state merged --json number,title
```

**If PR not merged:**
```
PR not merged yet. Cleanup will remove worktree and branch. Work may be lost.
```

### 5. Remove Worktree

```bash
git worktree remove "{worktree_path}" --force
```

### 6. Delete Branch (if merged)

**Only delete if PR was merged:**
```bash
git branch -d "{branch_name}" 2>/dev/null || git branch -D "{branch_name}"
```

### 7. Clean Empty Directory

```bash
rmdir "{worktree_root}" 2>/dev/null || true
```

### 8. Cancel Watcher (if exists)

**Check for and remove any watcher cron job:**
```
Use cron tool with action: "list"
Find job named "code-task-watcher-{feature_name}"
If found, use cron tool with action: "remove" and the jobId
```

### 9. Display Success

```
Cleanup complete: {feature_name}
Worktree removed, branch deleted, watcher cancelled.
```

---

## SUCCESS METRICS:

✅ PR status verified before cleanup
✅ Worktree removed successfully
✅ Branch deleted (if merged)
✅ Watcher cron job cancelled
✅ Confirmation message displayed

## FAILURE MODES:

❌ Cleanup before PR merged (loses work)
❌ Worktree has uncommitted changes
❌ Branch deletion fails
❌ **CRITICAL**: Cleaning up active work

## CLEANUP PROTOCOLS:

- Always verify PR is merged first
- Warn about uncommitted changes
- Use --force for worktree removal
- Clean up watcher job if exists
- Report what was cleaned up

---

## STANDALONE STEP

This step is invoked manually, not as part of the main workflow:

```
/code-process cleanup <feature-name>
```

<critical>
Remember: Only cleanup AFTER the PR is merged! Cleaning up too early loses work!
</critical>
