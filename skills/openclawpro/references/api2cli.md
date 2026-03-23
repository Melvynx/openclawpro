# api2cli

Turn any REST API into a CLI + Claude Code skill.

## Usage

```bash
api2cli create <name>                              # Scaffold from API docs
api2cli bundle <name>                              # Build
api2cli link <name> --skill-dir ~/.claude/skills   # Install CLI + skill
```

## Other Commands

```bash
api2cli update <name>        # Re-scaffold from updated API
api2cli list                 # List installed CLIs
api2cli install <repo>       # Install from GitHub
api2cli unlink <name>        # Remove from PATH
api2cli remove <name>        # Delete entirely
```
