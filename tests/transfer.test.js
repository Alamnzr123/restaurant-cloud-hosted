import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';

function sha256file(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const rs = fs.createReadStream(p);
    rs.on('data', d => h.update(d));
    rs.on('end', () => resolve(h.digest('hex')));
    rs.on('error', reject);
  });
}

async function waitForServer(port, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await new Promise((res, rej) => {
        const req = http.request({ method: 'GET', port, path: '/health' }, r => {
          r.on('data', () => {});
          r.on('end', () => res());
        });
        req.on('error', rej);
        req.end();
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('server not ready');
}

(async () => {
  const port = 4002;
  const serverPath = path.resolve('./dist/tools/server.js');
  const clientPath = path.resolve('./dist/tools/client.js');

  const serverProc = spawn(process.execPath, [serverPath], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  serverProc.stdout?.on('data', d => process.stdout.write(`[server] ${d.toString()}`));
  serverProc.stderr?.on('data', d => process.stderr.write(`[server-err] ${d.toString()}`));

  await waitForServer(port, 8000);

  const origFile = path.resolve('./tests/orig-test-file.txt');
  await new Promise((res) => {
    const ws = fs.createWriteStream(origFile);
    ws.write(Buffer.alloc(1024 * 1024, 'x'));
    ws.end(() => res());
  });

  const clientProc = spawn(process.execPath, [clientPath], {
    env: { ...process.env, SERVER: `ws://localhost:${port}/ws`, CLIENT_ID: 'test-client', FILE_PATH: origFile },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  clientProc.stdout?.on('data', d => process.stdout.write(`[client] ${d.toString()}`));
  clientProc.stderr?.on('data', d => process.stderr.write(`[client-err] ${d.toString()}`));

  await new Promise(r => setTimeout(r, 500));

  const downloaded = path.resolve('./tests/downloaded.bin');
  const post = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({ clientId: 'test-client', destPath: downloaded });
    const req = http.request({ method: 'POST', port, path: '/download', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });

  console.log('download result', post);

  const deadline = Date.now() + 5000;
  while (!fs.existsSync(downloaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  if (!fs.existsSync(downloaded)) {
    console.error('downloaded file missing'); process.exit(2);
  }

  const h1 = await sha256file(origFile);
  const h2 = await sha256file(downloaded);
  console.log('sha1(or) sha2', h1, h2);
  if (h1 !== h2) {
    console.error('checksum mismatch'); process.exit(3);
  }

  console.log('transfer test OK');

  serverProc.kill(); clientProc.kill();
  process.exit(0);
})();
