import { spawn } from 'child_process';
import path from 'path';

// Usage: npm run server:start -- <port>
const [, , port] = process.argv;
const distServer = path.resolve(process.cwd(), 'dist', 'tools', 'server.js');
const env = { ...process.env } as NodeJS.ProcessEnv;
if (port) env.PORT = port;

const child = spawn(process.execPath, [distServer], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
