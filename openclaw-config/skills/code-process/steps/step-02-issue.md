---
name: step-02-issue
description: Create GitHub issue for tracking
prev_step: steps/step-01-worktree.md
next_step: steps/step-03-launch.md
---

# Step 2: Create GitHub Issue

## MANDATORY EXECUTION RULES (READ FIRST):

- 🛑 NEVER create issue without --repo flag
- 🛑 NEVER proceed if issue creation fails
- ✅ ALWAYS use --repo flag with {target_repo}
- ✅ ALWAYS capture issue URL and number
- 📋 YOU ARE AN ISSUE CREATOR, not an implementer
- 💬 FOCUS on GitHub issue creation only
- 🚫 FORBIDDEN to start implementation here

## EXECUTION PROTOCOLS:

- 🎯 Create issue using gh CLI with --repo flag
- 💾 Capture and store issue URL and number
- 📖 Verify issue was created before proceeding
- 🚫 FORBIDDEN to skip issue creation

## CONTEXT BOUNDARIES:

- Variables from previous steps: `{target_repo}`, `{target_repo_path}`, `{feature_name}`, `{branch_name}`, `{worktree_path}`
- We're currently in {worktree_path}, so MUST use --repo flag
- Output: `{issue_url}`, `{issue_number}`

## YOUR TASK:

Create a GitHub issue to track this feature/task implementation.

---

## EXECUTION SEQUENCE:

### 1. Verify Current Location

**We should be in worktree:**
```bash
pwd
# Should show {worktree_path}
```

**⚠️ We're NOT in the original repo, so gh commands need --repo flag!**

### 2. Create GitHub Issue

**CRITICAL: Always use --repo flag!**

```bash
ISSUE_URL=$(gh issue create \
  --repo "{target_repo}" \
  --title "Feature: {feature_name}" \
  --label "enhancement" \
  --body "## Description

Implement {feature_name}.

## Working Environment

- **Branch:** {branch_name}
- **Worktree:** {worktree_path}
- **Mode:** {mode}

## Implementation Checklist

- [ ] Implementation started
- [ ] Code complete
- [ ] Tests passing
- [ ] Build passing
- [ ] PR opened

## Notes

_This issue was created by code-process skill._" \
  | tail -1)

echo "Issue URL: ${ISSUE_URL}"
```

### 3. Extract Issue Number

```bash
ISSUE_NUMBER=$(echo "${ISSUE_URL}" | grep -oE '[0-9]+$')
echo "Issue number: ${ISSUE_NUMBER}"
```

**Store:**
```
{issue_url} = ${ISSUE_URL}
{issue_number} = ${ISSUE_NUMBER}
```

### 4. Verify Issue Creation

**Confirm issue exists:**
```bash
gh issue view "{issue_number}" --repo "{target_repo}" --json title,url
```

### 5. Display Success

```
Issue #{issue_number} created: {issue_url}

Launching Claude agent...
```

---

## SUCCESS METRICS:

✅ Issue created in correct repository
✅ Issue URL captured
✅ Issue number extracted
✅ Issue verified to exist

## FAILURE MODES:

❌ Issue created in wrong repo (forgot --repo flag)
❌ gh auth not configured
❌ No permission to create issues
❌ **CRITICAL**: Running gh without --repo while in worktree

## ISSUE PROTOCOLS:

- ALWAYS use --repo flag when in worktree
- Include implementation checklist in body
- Capture both URL and number
- Verify issue exists before proceeding

---

## NEXT STEP:

After successful issue creation, load `./step-03-launch.md`

<critical>
Remember: We're in the WORKTREE, not the original repo! ALWAYS use --repo "{target_repo}" for all gh commands!
</critical>
