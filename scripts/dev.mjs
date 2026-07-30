import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const forgePython = resolve(root, 'card-forge', '.venv', 'Scripts', 'python.exe');
const commandShell = process.env.ComSpec ?? 'cmd.exe';

if (!existsSync(forgePython)) {
  console.error('Card Forge worker cannot start: card-forge/.venv/Scripts/python.exe is missing.');
  console.error('Install Python 3.11, then follow the setup steps in card-forge/README.md.');
  process.exit(1);
}

const commands = [
  // Windows cannot execute a .cmd file directly through child_process.spawn.
  // Invoke cmd.exe explicitly so npm scripts avoid the EINVAL launcher error.
  { name: 'api', command: commandShell, args: ['/d', '/s', '/c', 'npm.cmd run dev:api'] },
  { name: 'ui', command: commandShell, args: ['/d', '/s', '/c', 'npm.cmd run dev:ui'] },
  // Python is an executable, so it must not be wrapped in cmd.exe.
  { name: 'forge', command: forgePython, args: ['forge.py', 'order', 'worker'], shell: false },
];

const children = commands.map(({ name, command, args, shell = false }) => {
  const child = spawn(command, args, {
    cwd: name === 'forge' ? resolve(root, 'card-forge') : root,
    stdio: 'inherit',
    windowsHide: true,
    shell,
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[${name}] exited with code ${code}`);
  });
  return child;
});

function stop(signal) {
  for (const child of children) child.kill(signal);
  process.exit(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
