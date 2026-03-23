import chalk from 'chalk';
import { cp, mkdir, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const DESTINATIONS = [
  join(homedir(), '.claude', 'skills'),
  join(homedir(), '.openclaw', 'workspace', 'skills'),
];

export async function installSkills(): Promise<void> {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

  // Collect all skill directories from both sources
  const sources = [
    join(packageRoot, 'skills'),
    join(packageRoot, 'openclaw-config', 'skills'),
  ];

  const allSkills: { name: string; src: string }[] = [];

  for (const src of sources) {
    try {
      const entries = await readdir(src, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          allSkills.push({ name: e.name, src: join(src, e.name) });
        }
      }
    } catch {
      // source may not exist
    }
  }

  if (allSkills.length === 0) {
    console.log(chalk.dim('No skills to install'));
    return;
  }

  // Install every skill to every destination
  for (const dest of DESTINATIONS) {
    await mkdir(dest, { recursive: true });
  }

  for (const skill of allSkills) {
    for (const dest of DESTINATIONS) {
      await cp(skill.src, join(dest, skill.name), { recursive: true, force: true });
    }
    const short = DESTINATIONS.map(d => d.replace(homedir(), '~')).join(', ');
    console.log(chalk.green('  ✓ ') + skill.name + chalk.dim(` -> ${short}`));
  }

  console.log(chalk.bold.green(`\n✅ ${allSkills.length} skills installed to ${DESTINATIONS.length} locations`));
}
