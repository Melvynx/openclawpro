# Claude Code Setup on VPS

Configure Claude Code as the AI agent on the OpenClaw VPS.

## Install

```bash
npm i -g @anthropic-ai/claude-code
```

## Settings

Edit `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Edit",
      "Bash(git *)",
      "Bash(gh *)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(git push --force *)",
      "Bash(git reset --hard *)"
    ],
    "defaultMode": "bypassPermissions"
  },
  "includeCoAuthoredBy": false,
  "alwaysThinkingEnabled": true
}
```

`defaultMode: "bypassPermissions"` is typical for a VPS where Claude runs autonomously. The `deny` list blocks destructive commands.

## Skills

Skills live at `~/.claude/skills/<name>/SKILL.md`. They extend Claude with specialized workflows.

### Skill Categories

**API CLIs** (generated via `api2cli link --skill-dir`):
Any CLI created with api2cli can auto-generate a skill. See `references/api2cli.md`.

**Workflows** - Multi-step structured processes:
- `workflow-apex` - Analyze-Plan-Execute-eXamine methodology
- `workflow-brainstorm` - Deep iterative research
- `workflow-ci-fixer` - Auto-fix CI failures
- `workflow-clean-code` - Code quality analysis
- `workflow-debug` - Systematic error debugging
- `workflow-review-code` - Multi-agent code review

**Git**:
- `git-commit` - Clean commit messages
- `git-create-pr` - Auto-generate PR title/description
- `git-fix-pr-comments` - Implement PR review feedback
- `git-merge` - Context-aware merge with conflict resolution

**Utilities**:
- `utils-fix-errors` - Fix ESLint/TypeScript errors
- `utils-fix-grammar` - Fix grammar in files
- `utils-oneshot` - Fast single-task implementation
- `utils-refactor` - Parallel refactoring across files
- `utils-save-docs` - Save library docs locally
- `utils-ultrathink` - Deep thinking mode

**Meta** (create new skills/agents):
- `meta-skill-creator` - Create new skills
- `meta-subagent-creator` - Create subagents
- `meta-hooks-creator` - Create hooks
- `meta-prompt-creator` - Create prompts
- `meta-claude-memory` - Manage CLAUDE.md files

**Other**:
- `explore` - Fast codebase/web exploration
- `frontend-design` - UI component creation
- `marketing-copywriting` - Sales copy analysis
- `setup-tmux` - tmux configuration

### Installing Skills

Skills can come from:

1. **api2cli** - `api2cli link <name> --skill-dir ~/.claude/skills`
2. **Manual** - Create `~/.claude/skills/<name>/SKILL.md` with frontmatter
3. **Copy from another machine** - `scp -r` the skill folder

Skill frontmatter format:

```markdown
---
name: my-skill
description: What this skill does and when to trigger it
---

# Skill content here
```

## Agents Config in openclaw.json

The gateway manages Claude agents via `~/.openclaw/openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4-6",
        "fallbacks": ["anthropic/claude-sonnet-4-5"]
      },
      "workspace": "~/.openclaw/workspace",
      "compaction": {
        "mode": "safeguard"
      }
    }
  }
}
```
