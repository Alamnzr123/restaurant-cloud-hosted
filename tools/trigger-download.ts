import http from 'http';
import https from 'https';
import { URL } from 'url';

const SERVER = process.env.SERVER || 'http://localhost:4001';
const clientId = process.argv[2];
const dest = process.argv[3];

// optional 4th argument or --size=N
let sizeArg: string | undefined = undefined;
for (let i = 4; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a && a.startsWith('--size=')) sizeArg = a.split('=')[1];
}
if (!sizeArg && process.argv[4]) sizeArg = process.argv[4];


if (!clientId) {
  console.error('Usage: trigger-download.ts <clientId> [destPath]');
  process.exit(2);
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  if (typeof (globalThis as any).fetch === 'function') {
    const r = await (globalThis as any).fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  }
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = lib.request(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  try {
    const payload: any = { clientId, destPath: dest };
    if (sizeArg) payload.sizeMB = Number(sizeArg);
    const result = await postJson(`${SERVER}/download`, payload);
    console.log('Result:', result);
    process.exit(0);
  } catch (err) {
    const message = err && (err as Error).message ? (err as Error).message : String(err);
    console.error('trigger error', message);
    process.exit(1);
  }
})();
