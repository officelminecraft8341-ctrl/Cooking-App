import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const vite = spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

const server = spawn('npm', ['run', 'dev:server'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

const shutdown = () => {
  vite.kill('SIGTERM');
  server.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

vite.on('exit', (code) => {
  if (code !== 0) {
    server.kill('SIGTERM');
    process.exit(code ?? 1);
  }
});

server.on('exit', (code) => {
  if (code !== 0) {
    vite.kill('SIGTERM');
    process.exit(code ?? 1);
  }
});
