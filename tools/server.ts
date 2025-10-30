import http from 'http';
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import swaggerUi from 'swagger-ui-express';

const app = express();
app.use(express.json());

type ClientEntry = { ws: WebSocket; info: unknown };
const clients = new Map<string, ClientEntry>();

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true, clients: clients.size }));

app.get('/clients', (_req: Request, res: Response) => {
  res.json({ ok: true, clients: Array.from(clients.keys()) });
});

// Serve OpenAPI JSON and Swagger UI
const openapiPath = path.resolve(process.cwd(), 'openapi.json');
app.get('/openapi.json', (_req, res) => res.sendFile(openapiPath));
try {
  const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
} catch (err) {
  console.warn('Swagger UI disabled: openapi.json not valid or missing', err && (err as Error).message);
}

app.post('/download', async (req: Request, res: Response) => {
  try {
  const { clientId, destPath, sizeMB } = req.body as { clientId?: string; destPath?: string; sizeMB?: number };
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const entry = clients.get(clientId);
    if (!entry || entry.ws.readyState !== entry.ws.OPEN) return res.status(404).json({ error: 'client not connected' });

    const outPath = destPath ? path.resolve(destPath) : path.resolve(process.cwd(), `download-from-${clientId}.bin`);
    // ensure parent directory exists
    const parent = path.dirname(outPath);
    try {
      fs.mkdirSync(parent, { recursive: true });
    } catch (err) {
      console.error('failed to create dest directory', err);
      return res.status(500).json({ error: 'failed to create dest directory', details: (err as Error).message });
    }
    const writeStream = fs.createWriteStream(outPath);

    let expectedBytes: number | null = null;
    let received = 0;

    const e = entry!;

    // handle stream errors (disk full / permission)
    let finishedOrErrored = false;
    const onWriteError = (err: Error) => {
      if (finishedOrErrored) return;
      finishedOrErrored = true;
      console.error('writeStream error', err);
      e.ws.off('message', listener);
      try { e.ws.send(JSON.stringify({ type: 'error', message: 'server write error' })); } catch {}
      if (!res.headersSent) res.status(500).json({ error: 'write error', details: err.message });
      writeStream.destroy();
    };
    writeStream.on('error', onWriteError);

    function onMessage(data: WebSocket.RawData, isBinary?: boolean): void {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'metadata') {
            expectedBytes = msg.size;
            e.ws.send(JSON.stringify({ type: 'ack', ok: true }));
            console.log(`Receiving file of ${expectedBytes} bytes from ${clientId} -> ${outPath}`);
          } else if (msg.type === 'done') {
            if (finishedOrErrored) return;
            finishedOrErrored = true;
            writeStream.end(() => {
              e.ws.off('message', listener as unknown as (...args: unknown[]) => void);
              if (!res.headersSent) res.json({ ok: true, path: outPath, bytes: received });
            });
          } else if (msg.type === 'error') {
            // client reported an error
            console.warn('client reported error', msg);
            if (!res.headersSent) res.status(500).json({ error: 'client error', details: msg.message || msg });
          }
        } catch (err) {
          console.warn('Invalid control message', err);
        }
        return;
      }

      // binary
      if (finishedOrErrored) return;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (!writeStream.write(buf)) {
        // backpressure - log but we continue; 'drain' will be handled by stream
      }
      received += buf.length;
    }

    const listener: (data: WebSocket.RawData, isBinary?: boolean) => void = (data, isBinary) => onMessage(data, isBinary);
    e.ws.on('message', listener);

    // if client should generate the file first, send a generate command and wait for ack
    if (typeof sizeMB === 'number' && sizeMB > 0) {
      const genPromise = new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('generate timeout'));
        }, 20000);

        const onGenAck = (data: WebSocket.RawData, isBinary?: boolean) => {
          if (isBinary) return;
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'gen:ack') {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              e.ws.off('message', onGenAck);
              resolve();
            }
          } catch {
          }
        };
        e.ws.on('message', onGenAck);

        try {
          e.ws.send(JSON.stringify({ type: 'generate', sizeMB }), (err?: Error) => {
            if (err) {
              e.ws.off('message', onGenAck);
              clearTimeout(timeout);
              reject(err);
            }
          });
        } catch (err) {
          e.ws.off('message', onGenAck);
          clearTimeout(timeout);
          reject(err as Error);
        }
      });
      try {
        await genPromise;
        console.log(`Client ${clientId} generated ${sizeMB}MB file`);
      } catch (err) {
        e.ws.off('message', listener);
        writeStream.destroy();
        console.error('generate failed', err);
        return res.status(500).json({ error: 'generate failed', details: (err as Error).message });
      }
    }

    e.ws.send(JSON.stringify({ type: 'download' }), (err?: Error) => {
      if (err) {
        e.ws.off('message', listener as unknown as (...args: unknown[]) => void);
        writeStream.destroy();
        console.error('failed to send download command', err);
        return res.status(500).json({ error: 'failed to send download command', details: err.message });
      }
      e.ws.once('close', () => {
        e.ws.off('message', listener);
        if (!writeStream.destroyed) writeStream.end();
        if (!res.headersSent) res.status(500).json({ error: 'client disconnected' });
      });
    });
  } catch (err) {
    console.error('download handler error', err);
    if (!res.headersSent) {
      const msg = err && (err as Error).message ? (err as Error).message : String(err);
      res.status(500).json({ error: 'server error', details: msg });
    }
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  let registeredId: string | null = null;

  function handleOnce(message: WebSocket.RawData) {
    try {
      if (typeof message === 'string' || Buffer.isBuffer(message)) {
        const msg = JSON.parse(message.toString());
        if (msg.type === 'register' && msg.clientId) {
          registeredId = msg.clientId as string;
          clients.set(registeredId, { ws, info: msg.info || {} });
          console.log(`Client connected: ${registeredId}`);
          ws.send(JSON.stringify({ type: 'registered', clientId: registeredId }));
        } else {
          ws.close(1003, 'invalid registration');
        }
      } else {
        ws.close(1003, 'invalid registration');
      }
    } catch (err) {
      console.error('registration json parse error', err);
      ws.close(1003, 'invalid registration json');
    }
  }

  ws.once('message', handleOnce as (data: WebSocket.RawData) => void);

  ws.on('close', () => {
    if (registeredId) {
      clients.delete(registeredId);
      console.log(`Client disconnected: ${registeredId}`);
    }
  });
});

const PORT = Number(process.env.PORT || 4001);
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
