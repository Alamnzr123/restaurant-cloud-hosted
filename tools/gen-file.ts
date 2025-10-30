import fs from 'fs';
import path from 'path';

const defaultDir = path.resolve(process.cwd(), 'files');
const out = process.argv[2] || path.join(defaultDir, 'file_to_download.txt');
const sizeMB = Number(process.argv[3] || 100);
const bytes = sizeMB * 1024 * 1024;

console.log(`Creating ${sizeMB}MB file at ${out}`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const ws = fs.createWriteStream(out);

const chunk = Buffer.alloc(1024 * 1024, 'a');
let written = 0;
async function run() {
  while (written < bytes) {
    const toWrite = Math.min(chunk.length, bytes - written);
    ws.write(chunk.slice(0, toWrite));
    written += toWrite;
    if (written % (10 * 1024 * 1024) === 0) console.log(`written ${Math.round(written/1024/1024)}MB`);
    await new Promise(r => setImmediate(r));
  }
  ws.end(() => console.log('done'));
}
run();
