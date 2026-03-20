# api2cli - Create CLIs from REST APIs

`api2cli` turns any REST API into a standardized CLI + Claude Code skill in one command.

## Install

```bash
npm i -g api2cli
```

## Create a New CLI

```bash
api2cli create <name>
```

This:
1. Discovers the API docs (OpenAPI spec, website, or manual input)
2. Scaffolds the CLI with all resources and commands
3. Prompts for auth token configuration

## Build & Link

```bash
api2cli bundle <name>        # Compile the CLI
api2cli link <name>          # Add to PATH
api2cli link <name> --skill-dir ~/.claude/skills  # Also install the Claude Code skill
```

`link --skill-dir` copies the auto-generated `SKILL.md` to the skills directory so Claude Code can use the CLI.

## Update When API Changes

```bash
api2cli update <name>
api2cli bundle <name>
```

## Manage CLIs

```bash
api2cli list                 # List all installed CLIs
api2cli tokens               # List configured API tokens
api2cli unlink <name>        # Remove from PATH
api2cli remove <name>        # Delete entirely
api2cli doctor               # Check system requirements
```

## Install from GitHub

```bash
api2cli install <github-repo-or-registry-name>
```

## Example: Full Flow

Creating a CLI for a bookmarking API:

```bash
api2cli create saveit
# Follow prompts: provide API docs URL, set auth token
api2cli bundle saveit
api2cli link saveit --skill-dir ~/.claude/skills
# Now `saveit` is available as a CLI command
# And Claude Code has a /saveit-cli skill
```

## CLIs That Work Well with OpenClaw

Common CLIs to create for a productive VPS setup:

| CLI | API | Purpose |
|-----|-----|---------|
| frontapp | Front API | Shared inbox, customer communication |
| dub | Dub.co API | Short links, analytics |
| typefully | Typefully API | Social media drafts, scheduling |
| mercury | Mercury API | Banking, transactions, transfers |
| lumail | Lumail API | Email marketing, campaigns |
| codeline | Codeline API | School platform, products, orders |
| porkbun | Porkbun API | Domain registrar, DNS management |
| saveit | SaveIt API | Bookmark management |
| agentmail | AgentMail API | AI agent email inboxes |
| exa | Exa API | AI-powered web search |
| context7 | Context7 API | Library documentation lookup |
| calcom | Cal.com API | Calendar scheduling |
| aviationstack | AviationStack API | Flight tracking |

## How the Generated Skill Works

The generated SKILL.md contains:
- CLI name and description
- All available resources and subcommands
- Auth configuration details
- Usage examples

Claude Code can then use the CLI directly in bash commands when the user mentions related keywords.
