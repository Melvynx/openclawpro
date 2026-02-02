# OpenClaw Pro Configuration

Premium configuration files for OpenClaw VPS instances.

## Contents

- `skills/` - Claude Code skills for autonomous workflows
- `IDENTITY.md` - Agent identity and behavior rules

## Installation

Installed automatically via:

```bash
npx aiblueprint-cli@latest openclaw pro activate YOUR_TOKEN
npx aiblueprint-cli@latest openclaw pro setup
```

## Skills Included

### code-process

The mandatory workflow for all code implementation tasks:

- Creates isolated git worktree
- Spawns background Claude agent with /apex
- Sets up cron watcher for completion monitoring
- Sends Telegram notifications

Usage:
```
/code-process add-dark-mode           # Standard thorough mode
/code-process fix-login-bug -ae       # Economy/fast mode
```
