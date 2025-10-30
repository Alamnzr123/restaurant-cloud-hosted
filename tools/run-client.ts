import { spawn } from 'child_process';
import path from 'path';

// Usage: npm run client:start -- <clientId> [filePath] [server]
const [, , clientId, filePath, server] = process.argv;
if (!clientId) {
  console.error('Usage: npm run client:start -- <clientId> [filePath] [server]');
  process.exit(2);
}

const distClient = path.resolve(process.cwd(), 'dist', 'tools', 'client.js');
const env = { ...process.env, CLIENT_ID: clientId } as NodeJS.ProcessEnv;
if (filePath) env.FILE_PATH = filePath;
if (server) env.SERVER = server;

const child = spawn(process.execPath, [distClient], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
