---
name: step-04-watcher
description: Setup cron watcher to monitor completion
prev_step: steps/step-03-launch.md
next_step: null
---

# Step 4: Setup Watcher

## MANDATORY EXECUTION RULES (READ FIRST):

- 🛑 NEVER skip watcher setup
- 🛑 NEVER set watcher interval less than 60 seconds
- ✅ ALWAYS use isolated session for watcher
- ✅ ALWAYS include cleanup instructions in watcher
- 📋 YOU ARE A SCHEDULER, not an implementer
- 💬 FOCUS on cron job creation only
- 🚫 FORBIDDEN to wait for agent completion here

## EXECUTION PROTOCOLS:

- 🎯 Create cron job using OpenClaw cron tool
- 💾 Capture and store job ID
- 📖 Watcher runs independently until agent finishes
- 🚫 FORBIDDEN to continuously poll here

## CONTEXT BOUNDARIES:

- Variables from previous steps: `{claude_pid}`, `{feature_name}`, `{target_repo}`, `{worktree_path}`, `{branch_name}`, `{issue_url}`
- Output: `{cron_job_id}`
- Watcher runs in isolated agent, checks every minute

## YOUR TASK:

Setup a cron job to monitor the Claude agent and report when complete.

---

## EXECUTION SEQUENCE:

### 1. Prepare Watcher Configuration

**Watcher job config:**
```json
{
  "action": "add",
  "job": {
    "name": "code-task-watcher-{feature_name}",
    "schedule": { "kind": "every", "everyMs": 60000 },
    "sessionTarget": "isolated",
    "payload": {
      "kind": "agentTurn",
      "message": "...(see below)...",
      "deliver": true
    }
  }
}
```

### 2. Watcher Message Content

The watcher checks if the Claude process is still running:

```
Check if code-task agent is still running.

1. Run: `ps -p {claude_pid} > /dev/null 2>&1 && echo RUNNING || echo FINISHED`

2. If RUNNING:
   - Do nothing, wait for next check
   - Output: "Agent still running (PID: {claude_pid})"

3. If FINISHED:
   A) Delete this cron job (use the jobId from this message)

   B) Gather results:
      ```bash
      cd {worktree_path}
      git log --oneline -10
      gh pr list --repo {target_repo} --head {branch_name}
      gh issue view {issue_url} --repo {target_repo}
      ```

   C) Send final report to main Telegram thread:

      Code task FINISHED: {feature_name}
      Repo: {target_repo}
      Issue: {issue_url}
      Branch: {branch_name}

      Commits: [git log output, 1 line per commit]
      PR: [gh pr list output or "No PR"]

      Cleanup when merged: /code-process cleanup {feature_name}
```

### 3. Create Cron Job

**Use OpenClaw cron tool to create the job:**

```
Use the cron tool with action: "add" and the job configuration above.
```

**Capture the returned job ID:**
```
{cron_job_id} = (returned from cron tool)
```

### 4. Verify Job Created

**List cron jobs to confirm:**
```
Use cron tool with action: "list" to verify job exists.
```

### 5. Display Final Summary

```
Code process complete.
Feature: {feature_name}
Repo: {target_repo}
Branch: {branch_name}
Issue: {issue_url}
Agent PID: {claude_pid}
Watcher Job: {cron_job_id}

Telegram notification on completion.
Cleanup: /code-process cleanup {feature_name}
```

---

## SUCCESS METRICS:

✅ Cron job created with correct configuration
✅ Job ID captured
✅ Watcher uses isolated session
✅ Watcher message includes all required checks
✅ Final summary displayed with all details

## FAILURE MODES:

❌ Cron job not created
❌ Missing cleanup instructions in watcher
❌ Wrong interval (too frequent)
❌ **CRITICAL**: Not using isolated session for watcher

## WATCHER PROTOCOLS:

- Check every 60 seconds (not more frequent)
- Use isolated session target
- Include self-cleanup when finished
- Report full results to Telegram
- Include next steps in final report

---

## WORKFLOW COMPLETE

The code-process workflow is now complete. The Claude agent is implementing the feature in background, and the watcher will notify you when done.

<critical>
Remember: The watcher runs in an ISOLATED session. It must delete itself when the agent finishes!
</critical>
