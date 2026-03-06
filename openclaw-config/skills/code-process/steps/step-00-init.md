---
name: step-00-init
description: Parse arguments and validate environment
next_step: steps/step-01-worktree.md
---

# Step 0: Initialize

## MANDATORY EXECUTION RULES (READ FIRST):

- 🛑 NEVER skip argument parsing
- 🛑 NEVER proceed without capturing target_repo
- ✅ ALWAYS validate git repo exists
- ✅ ALWAYS capture repo info BEFORE any cd commands
- 📋 YOU ARE A VALIDATOR, not an executor
- 💬 FOCUS on parsing and validation only
- 🚫 FORBIDDEN to create worktree or issue here

## EXECUTION PROTOCOLS:

- 🎯 Parse arguments first, then validate environment
- 💾 Store all state variables for subsequent steps
- 📖 Complete validation before loading next step
- 🚫 FORBIDDEN to proceed if validation fails

## CONTEXT BOUNDARIES:

- Input: `$ARGUMENTS` from skill invocation
- Output: Validated state variables for all steps
- No previous context expected (this is entry point)

## YOUR TASK:

Parse arguments, validate the environment, and prepare state variables for the workflow.

---

## EXECUTION SEQUENCE:

### 1. Parse Arguments

Extract from `$ARGUMENTS`:

**Feature name:**
- First non-flag argument = `{feature_name}`
- Must be provided (no default)
- Sanitize: lowercase, replace spaces with hyphens

**Mode flag:**
| Flag | Mode | Description |
|------|------|-------------|
| `-ax` | examine | Thorough implementation with review (default) |
| `-ae` | economy | Fast implementation, minimal review |

```
{feature_name} = first argument
{mode} = -ax (default) or -ae if specified
```

### 2. Validate Feature Name

**If `{feature_name}` is empty:**
```
Feature name required.

Usage: /code-process <feature-name> [-ax|-ae]

Examples:
  /code-process add-dark-mode
  /code-process fix-login-bug -ae
```
**STOP**

### 3. Validate Git Repository

**Check we're in a git repo:**
```bash
git rev-parse --show-toplevel
```

**If fails:**
```
Not in a git repository. Navigate to a project directory first.
```
**STOP**

### 4. Capture Repository Info (CRITICAL!)

**⚠️ MUST capture BEFORE any directory changes:**

```bash
# Get absolute path to repo
TARGET_REPO_PATH="$(git rev-parse --show-toplevel)"

# Get GitHub repo name (owner/repo)
TARGET_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

echo "Target repo path: ${TARGET_REPO_PATH}"
echo "Target repo: ${TARGET_REPO}"
```

**Store:**
```
{target_repo_path} = result of git rev-parse
{target_repo} = result of gh repo view
```

### 5. Set Derived Variables

```
{worktree_root} = ${OPENCLAW_ROOT:-.}/.openclaw/code-projects
{branch_name} = feature/{feature_name}
{worktree_path} = {worktree_root}/{feature_name}
```

### 6. Check for Existing Worktree

**If `{worktree_path}` already exists:**
```
Worktree already exists: {feature_name}
Path: {worktree_path}

Options:
1. Resume work in existing worktree
2. Cleanup first: /code-process cleanup {feature_name}
```
**STOP** - ask user how to proceed

### 7. Display Summary

```
Feature: {feature_name}
Mode: {mode}
Repo: {target_repo}
Branch: {branch_name}
Worktree: {worktree_path}

Creating worktree...
```

---

## SUCCESS METRICS:

✅ Feature name parsed and validated
✅ Mode flag correctly detected
✅ Git repository validated
✅ target_repo_path captured
✅ target_repo (owner/name) captured
✅ All derived variables set
✅ No existing worktree conflict

## FAILURE MODES:

❌ Missing feature name
❌ Not in a git repository
❌ Cannot determine GitHub repo
❌ Worktree already exists
❌ **CRITICAL**: Changing directory before capturing repo info

## INIT PROTOCOLS:

- Parse ALL arguments before any validation
- Capture repo info in original directory
- Check for conflicts before proceeding
- Display clear summary before next step

---

## NEXT STEP:

After successful validation, load `./step-01-worktree.md`

<critical>
Remember: CAPTURE target_repo BEFORE any cd commands! This is the #1 cause of failures.
</critical>
