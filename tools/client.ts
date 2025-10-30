import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const SERVER = process.env.SERVER || 'ws://localhost:4001/ws';
const CLIENT_ID = process.env.CLIENT_ID || `client-${Math.random().toString(36).slice(2, 8)}`;
const defaultFilesDir = path.resolve(process.cwd(), 'files');
const FILE_PATH = process.env.FILE_PATH || path.join(defaultFilesDir, 'file_to_download.txt');

const ws = new WebSocket(SERVER);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'register', clientId: CLIENT_ID, info: { filePath: FILE_PATH } }));
});

ws.on('message', async (data) => {
  if (typeof data === 'string' || Buffer.isBuffer(data)) {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'registered') {
        console.log(`Registered as ${msg.clientId}`);
      } else if (msg.type === 'download') {
        console.log('Download requested, streaming file:', FILE_PATH);
        try {
          const stats = fs.statSync(FILE_PATH);
          ws.send(JSON.stringify({ type: 'metadata', size: stats.size }));

          const rs = fs.createReadStream(FILE_PATH, { highWaterMark: 64 * 1024 });
          try {
            for await (const chunk of rs) {
              ws.send(chunk as Buffer);
            }
            ws.send(JSON.stringify({ type: 'done' }));
            console.log('Streaming completed');
          } catch (streamErr) {
            console.error('stream error', streamErr);
            try { ws.send(JSON.stringify({ type: 'error', message: String(streamErr) })); } catch {}
          }
        } catch (err) {
          console.error('client message handler error', err);
          const msg = err && (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (err as Error).message;
          try { ws.send(JSON.stringify({ type: 'error', message: msg })); } catch {}
        }
      }
      else if (msg.type === 'generate' && typeof msg.sizeMB === 'number') {
        const sizeMB: number = msg.sizeMB;
        console.log(`Generate requested: ${sizeMB}MB -> ${FILE_PATH}`);
        try {
          fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
          const bytes = sizeMB * 1024 * 1024;
          const wsOut = fs.createWriteStream(FILE_PATH);
          const chunk = Buffer.alloc(1024 * 1024, 'a');
          let written = 0;
          while (written < bytes) {
            const toWrite = Math.min(chunk.length, bytes - written);
            wsOut.write(chunk.slice(0, toWrite));
            written += toWrite;
            // yield to event loop
            await new Promise(r => setImmediate(r));
          }
          wsOut.end();
          try { ws.send(JSON.stringify({ type: 'gen:ack' })); } catch {}
          console.log('Generation complete');
        } catch (err) {
          console.error('generate error', err);
          try { ws.send(JSON.stringify({ type: 'error', message: (err as Error).message || String(err) })); } catch {}
        }
      }
    } catch (err) {
      console.error('client message handler error', err);
    }
  }
});

ws.on('close', (code, reason) => console.log('ws closed', code, reason && reason.toString()));
