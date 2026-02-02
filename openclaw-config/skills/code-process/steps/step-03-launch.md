---
name: step-03-launch
description: Launch Claude agent in background
prev_step: steps/step-02-issue.md
next_step: steps/step-04-watcher.md
---

# Step 3: Launch Claude Agent

## MANDATORY EXECUTION RULES (READ FIRST):

- 🛑 NEVER use sessions_spawn - ONLY use `claude -p` CLI
- 🛑 NEVER forget to report to Telegram
- ✅ ALWAYS launch from worktree directory
- ✅ ALWAYS use /apex with correct mode flag
- ✅ ALWAYS capture and report the PID
- 📋 YOU ARE A LAUNCHER, not an implementer
- 💬 FOCUS on launching the agent only
- 🚫 FORBIDDEN to wait for agent completion here

## EXECUTION PROTOCOLS:

- 🎯 Navigate to worktree, launch claude CLI, capture PID
- 💾 Store PID for watcher step
- 📖 Report launch details to Telegram
- 🚫 FORBIDDEN to block on agent execution

## CONTEXT BOUNDARIES:

- Variables from previous steps: `{worktree_path}`, `{target_repo}`, `{feature_name}`, `{branch_name}`, `{issue_url}`, `{mode}`
- This step launches the agent and immediately returns
- Agent runs in background; watcher monitors completion

## YOUR TASK:

Launch a Claude agent in the background to implement the feature.

---

## EXECUTION SEQUENCE:

### 1. Navigate to Worktree

```bash
cd "{worktree_path}"
pwd  # Confirm location
```

### 2. Construct the Prompt

**Based on mode:**

| Mode | Prompt | Description |
|------|--------|-------------|
| `-ax` | `/apex -ax -pr {issue_url}` | Thorough with examine phase |
| `-ae` | `/apex -ae -pr {issue_url}` | Economy/fast mode |

```bash
CLAUDE_PROMPT="/apex {mode} -pr {issue_url}"
echo "Prompt: ${CLAUDE_PROMPT}"
```

### 3. Launch Claude Agent

**⚠️ CRITICAL: Use `claude -p` CLI, NOT sessions_spawn!**

```bash
cd "{worktree_path}"

# Launch in background
claude -p --dangerously-skip-permissions "${CLAUDE_PROMPT}" &

CLAUDE_PID=$!
echo "Claude PID: ${CLAUDE_PID}"
```

**Store:**
```
{claude_pid} = ${CLAUDE_PID}
```

### 4. Verify Process Started

```bash
# Brief pause to let process initialize
sleep 2

# Check if running
if ps -p ${CLAUDE_PID} > /dev/null 2>&1; then
  echo "✅ Claude agent is running (PID: ${CLAUDE_PID})"
else
  echo "❌ Claude agent failed to start!"
  exit 1
fi
```

### 5. Report to Telegram

**Send message to main Telegram thread:**

```
✅ Code task started: {feature_name}

📦 Repo: {target_repo}
📍 Working directory: {worktree_path}
🔗 Issue: {issue_url}
🔀 Branch: {branch_name}
⚙️ Mode: {mode}

Command launched:
cd {worktree_path} && claude -p --dangerously-skip-permissions "{CLAUDE_PROMPT}"

PID: {claude_pid}

Agent is now implementing the feature in background.
Use /code-process status to check progress.
```

### 6. Display Success

```
╔════════════════════════════════════════════════════════════╗
║              🚀 CLAUDE AGENT LAUNCHED                      ║
╠════════════════════════════════════════════════════════════╣
║ Feature: {feature_name}                                    ║
║ Mode: {mode}                                               ║
║ PID: {claude_pid}                                          ║
║ Prompt: /apex {mode} -pr {issue_url}                       ║
╠════════════════════════════════════════════════════════════╣
║ Agent is running in background...                          ║
║ Setting up watcher to monitor completion.                  ║
╚════════════════════════════════════════════════════════════╝

Proceeding to setup watcher...
```

---

## DO NOT BLOCK

**The agent runs in background. Do NOT:**
- Wait for it to complete
- Read its output
- Check its status continuously

**The watcher (step-04) handles monitoring.**

---

## SUCCESS METRICS:

✅ Agent launched with correct /apex prompt
✅ PID captured and verified
✅ Process confirmed running
✅ Telegram notification sent
✅ Did not block on completion

## FAILURE MODES:

❌ Using sessions_spawn instead of claude -p
❌ Blocking on agent completion
❌ Wrong mode flag
❌ Forgot to report to Telegram
❌ **CRITICAL**: Not capturing PID

## LAUNCH PROTOCOLS:

- ALWAYS use `claude -p` CLI command
- Launch with & for background execution
- Capture PID immediately
- Verify process is running
- Report full details to Telegram

---

## NEXT STEP:

After successful launch, load `./step-04-watcher.md`

<critical>
Remember: Use `claude -p`, NOT sessions_spawn! The agent runs in BACKGROUND - don't wait for it!
</critical>
