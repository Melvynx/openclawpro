---
name: step-01-worktree
description: Create git worktree, branch, and install dependencies
prev_step: steps/step-00-init.md
next_step: steps/step-02-issue.md
---

# Step 1: Create Worktree

## MANDATORY EXECUTION RULES (READ FIRST):

- 🛑 NEVER create worktree inside the project folder
- 🛑 NEVER proceed if worktree creation fails
- ✅ ALWAYS create worktree in central location ({worktree_root})
- ✅ ALWAYS copy .env files to worktree
- ✅ ALWAYS install dependencies
- 📋 YOU ARE A SETUP AGENT, not an implementer
- 💬 FOCUS on environment setup only
- 🚫 FORBIDDEN to start coding or create issues here

## EXECUTION PROTOCOLS:

- 🎯 Create worktree from target repo, then install deps
- 💾 Verify worktree is ready before proceeding
- 📖 Complete all setup before loading next step
- 🚫 FORBIDDEN to skip dependency installation

## CONTEXT BOUNDARIES:

- Variables from step-00: `{target_repo_path}`, `{target_repo}`, `{feature_name}`, `{branch_name}`, `{worktree_root}`, `{worktree_path}`
- This step creates the isolated development environment
- No GitHub operations here (that's step-02)

## YOUR TASK:

Create a git worktree with a new branch and install all dependencies.

---

## EXECUTION SEQUENCE:

### 1. Navigate to Target Repo

```bash
cd "{target_repo_path}"
```

### 2. Pull Latest Changes (CRITICAL!)

**Sync with remote before creating worktree:**
```bash
git fetch origin
git pull origin main --ff-only
```

This ensures the worktree is based on the latest code, not stale/legacy code.

### 3. Create Worktree Directory

```bash
mkdir -p "{worktree_root}"
```

### 4. Create Worktree with Branch

**Create new branch and worktree:**
```bash
git worktree add -b "{branch_name}" "{worktree_path}"
```

**If branch already exists (from previous attempt):**
```bash
git worktree add "{worktree_path}" "{branch_name}"
```

**Verify success:**
```bash
ls -la "{worktree_path}"
```

### 5. Copy Environment Files

**Copy all .env files to worktree:**
```bash
for env_file in "{target_repo_path}"/.env*; do
  [ -f "$env_file" ] && cp "$env_file" "{worktree_path}/"
done
```

**List copied files:**
```bash
ls -la "{worktree_path}"/.env* 2>/dev/null || echo "No .env files found"
```

### 6. Install Dependencies

**Navigate to worktree:**
```bash
cd "{worktree_path}"
```

**Detect package manager and install:**
```bash
if [ -f bun.lockb ] || [ -f bun.lock ]; then
  echo "📦 Installing with bun..."
  bun install
elif [ -f pnpm-lock.yaml ]; then
  echo "📦 Installing with pnpm..."
  pnpm install
elif [ -f yarn.lock ]; then
  echo "📦 Installing with yarn..."
  yarn install
elif [ -f package-lock.json ]; then
  echo "📦 Installing with npm..."
  npm install
elif [ -f package.json ]; then
  echo "📦 Installing with npm (no lockfile)..."
  npm install
elif [ -f requirements.txt ]; then
  echo "🐍 Installing Python dependencies..."
  pip install -r requirements.txt
elif [ -f Gemfile ]; then
  echo "💎 Installing Ruby dependencies..."
  bundle install
elif [ -f go.mod ]; then
  echo "🐹 Installing Go dependencies..."
  go mod download
else
  echo "ℹ️ No package manager detected, skipping install"
fi
```

### 7. Verify Setup

**Check worktree is valid:**
```bash
cd "{worktree_path}"
git status
```

**Confirm branch:**
```bash
git branch --show-current
```

### 8. Display Success

```
Worktree created at {worktree_path}
Branch: {branch_name}
Dependencies installed, env files copied.

Creating GitHub issue...
```

---

## SUCCESS METRICS:

✅ Worktree directory created at {worktree_path}
✅ Branch {branch_name} created and checked out
✅ .env files copied from source repo
✅ Dependencies installed successfully
✅ git status shows clean working directory

## FAILURE MODES:

❌ Worktree creation failed
❌ Branch already exists with conflicts
❌ Dependency installation failed
❌ **CRITICAL**: Creating worktree inside project folder

## WORKTREE PROTOCOLS:

- Always use central {worktree_root} location
- Copy .env files before installing deps
- Verify git status after setup
- Don't start work until issue is created

---

## NEXT STEP:

After successful worktree setup, load `./step-02-issue.md`

<critical>
Remember: Worktree must be in {worktree_root}, NEVER inside the project folder itself!
</critical>
