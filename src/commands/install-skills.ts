import chalk from 'chalk';
import { cp, mkdir, readdir, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

export async function installSkills(): Promise<void> {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

  // 1. Install Claude Code skills to ~/.claude/skills/
  const skillsSrc = join(packageRoot, 'skills');
  const skillsDest = join(homedir(), '.claude', 'skills');

  let skillNames: string[];
  try {
    const entries = await readdir(skillsSrc, { withFileTypes: true });
    skillNames = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    console.error(chalk.red('No bundled skills found in package'));
    process.exit(1);
  }

  if (skillNames.length === 0) {
    console.log(chalk.dim('No skills to install'));
    return;
  }

  await mkdir(skillsDest, { recursive: true });

  for (const name of skillNames) {
    await cp(join(skillsSrc, name), join(skillsDest, name), { recursive: true, force: true });
    console.log(chalk.green('  ✓ ') + name + chalk.dim(' -> ~/.claude/skills/'));
  }

  // 2. Install OpenClaw workspace skills to ~/.openclaw/workspace/skills/
  const workspaceSkillsSrc = join(packageRoot, 'openclaw-config', 'skills');
  const workspaceSkillsDest = join(homedir(), '.openclaw', 'workspace', 'skills');

  let workspaceSkillNames: string[] = [];
  try {
    const entries = await readdir(workspaceSkillsSrc, { withFileTypes: true });
    workspaceSkillNames = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    // openclaw-config/skills may not exist - that's OK
  }

  if (workspaceSkillNames.length > 0) {
    await mkdir(workspaceSkillsDest, { recursive: true });

    for (const name of workspaceSkillNames) {
      await cp(join(workspaceSkillsSrc, name), join(workspaceSkillsDest, name), { recursive: true, force: true });
      console.log(chalk.green('  ✓ ') + name + chalk.dim(' -> ~/.openclaw/workspace/skills/'));
    }
  }

  // 3. Install IDENTITY.md to ~/.openclaw/workspace/ (if exists)
  const identitySrc = join(packageRoot, 'openclaw-config', 'IDENTITY.md');
  const identityDest = join(homedir(), '.openclaw', 'workspace', 'IDENTITY.md');

  if (existsSync(identitySrc)) {
    await mkdir(join(homedir(), '.openclaw', 'workspace'), { recursive: true });
    await cp(identitySrc, identityDest, { force: true });
    console.log(chalk.green('  ✓ ') + 'IDENTITY.md' + chalk.dim(' -> ~/.openclaw/workspace/'));
  }

  const total = skillNames.length + workspaceSkillNames.length + (existsSync(identitySrc) ? 1 : 0);
  console.log(chalk.bold.green(`\n✅ ${total} items installed`));
}
