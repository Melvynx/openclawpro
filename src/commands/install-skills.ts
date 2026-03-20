import chalk from 'chalk';
import { cp, mkdir, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

export async function installSkills(): Promise<void> {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
    console.log(chalk.green('  ✓ ') + name);
  }

  console.log(chalk.bold.green(`\n✅ ${skillNames.length} skills installed to ~/.claude/skills/`));
}
