---
name: code-process
description: "**ALL code tasks on projects MUST use this skill.** Creates isolated git worktree, spawns background Claude agent with progress tracking. Use for ANY feature, refactor, bug fix, or code change."
argument-hint: "<feature-name> [-ax|-ae]"
---

<objective>
**THE mandatory process for all code implementation tasks.**

This skill manages code implementation in complete isolation:
- Separate git worktree (no conflicts with main)
- GitHub issue for tracking
- Background Claude agent running /apex
- Cron watcher for monitoring
- Automatic Telegram report when finished
</objective>

<when_to_use>
🛑 **ALWAYS use this skill when:**
- Implementing a new feature
- Fixing a bug
- Refactoring code
- Making ANY code change that touches more than 1-2 files

✅ **This is THE code process** - not optional, but required.
</when_to_use>

<quick_start>
```bash
/code-process add-dark-mode           # Standard thorough mode (-ax)
/code-process fix-login-bug -ae       # Economy/fast mode
/code-process refactor-auth -ax       # Explicit thorough mode
```
</quick_start>

<parameters>
| Parameter | Description |
|-----------|-------------|
| `<feature-name>` | Name for the feature/task (becomes branch name) |
| `-ax` | Examine mode: thorough implementation with review (default) |
| `-ae` | Economy mode: fast implementation, minimal review |
</parameters>

<entry_point>
**FIRST ACTION:** Load `steps/step-00-init.md`

This step parses arguments and validates the environment.
</entry_point>

<step_files>
| Step | File | Purpose |
|------|------|---------|
| 00 | `steps/step-00-init.md` | Parse args, validate environment |
| 01 | `steps/step-01-worktree.md` | Create worktree + branch + install deps |
| 02 | `steps/step-02-issue.md` | Create GitHub issue |
| 03 | `steps/step-03-launch.md` | Launch Claude agent |
| 04 | `steps/step-04-watcher.md` | Setup cron watcher |
| 05 | `steps/step-05-cleanup.md` | Cleanup after merge |
</step_files>

<state_variables>
| Variable | Type | Description |
|----------|------|-------------|
| `{feature_name}` | string | Feature/task name |
| `{mode}` | string | `-ax` (examine) or `-ae` (economy) |
| `{target_repo_path}` | string | Absolute path to target repo |
| `{target_repo}` | string | GitHub repo (owner/name) |
| `{worktree_root}` | string | Central worktree location |
| `{worktree_path}` | string | This feature's worktree path |
| `{branch_name}` | string | Feature branch name |
| `{issue_url}` | string | Created GitHub issue URL |
| `{issue_number}` | string | Issue number |
| `{claude_pid}` | string | Background Claude process ID |
| `{cron_job_id}` | string | Watcher cron job ID |
</state_variables>

<critical_rules>
🛑 NEVER skip any step - follow the workflow exactly
🛑 NEVER create worktree inside project folder (use central location)
🛑 NEVER use sessions_spawn - ALWAYS use `claude -p` CLI
✅ ALWAYS capture target_repo BEFORE changing directories
✅ ALWAYS use --repo flag for gh commands in worktree
✅ ALWAYS report launch details to Telegram
✅ ALWAYS load only the current step file (progressive disclosure)
</critical_rules>

<workflow_overview>
```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  00: INIT    │──►│  01: WORKTREE│──►│  02: ISSUE   │──►│  03: LAUNCH  │──►│  04: WATCHER │
│  Parse args  │   │  Branch+deps │   │  GitHub      │   │  Claude -p   │   │  Cron job    │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
                                                                                    │
                                                                                    ▼
                                                                            ┌──────────────┐
                                                                            │  05: CLEANUP │
                                                                            │  After merge │
                                                                            └──────────────┘
```
</workflow_overview>

<success_criteria>
✅ Each step executed completely before moving to next
✅ Worktree created in central location, not in project
✅ GitHub issue created with tracking checklist
✅ Claude agent launched with correct /apex mode
✅ Cron watcher monitoring process
✅ Telegram notification sent on completion
</success_criteria>
