# Server-initiated download from on-premise clients

This folder adds a small server and client toolset to demonstrate how a cloud server
can request and receive a large file (100MB) from an on-premise client behind NAT.

Overview

to the server over the existing WebSocket connection. The server writes the incoming
binary chunks to disk.

## Quickstart (Windows PowerShell)

1. Install dependencies

```powershell
npm install
```

2. Build the TypeScript tools (creates `dist/tools`)

```powershell
npx tsc -p tsconfig.tools.json
```

3. Generate a 100 MB file in the project root (client-side)

```powershell
npm run tools:genfile
```

4. Start the server (compiled) from the project root

```powershell
npm run server:start
```

5. Start the client on the on-premise machine (compiled), You can register as much for the client name

```powershell
# <client-id> is any identifier the client will register with the server
# The second argument is the path on the *client* machine that the client will read and stream.

npm run client:start -- my-restaurant-01 .\files\file_to_download.txt ws://localhost:4001/ws
```

Add another client (if needed)

```powershell
npm run client:start -- my-restaurant-02 .\files\file_to_download.txt ws://localhost:4001/ws
```

6. Trigger a download from any machine that can reach the server API

```powershell
# using the bundled trigger tool (compiled)
# NOTE: the destPath here is on the *server* machine — it is where the server will save the received file.

npm run tools:trigger my-restaurant-01
```

OR

```powershell
npm run tools:trigger my-restaurant-01 .\downloads\downloadled.bin
```

## Files of interest

- `tools/server.ts` — server with WebSocket endpoint and POST `/download` API.
- `tools/client.ts` — example client that registers and streams local file on request.
- `tools/trigger-download.ts` — simple CLI to call server API to trigger a download.
- `tools/gen-file.ts` — generate a large test file (default 100MB).
- `tests/transfer.test.ts` — automated TypeScript test that spawns server & client and validates file checksums.

Notes

- The project provides a Swagger UI at `/docs` and the raw OpenAPI JSON at `/openapi.json` (when the server is running). Use it to call `/download` interactively.

## Swagger API documentation

The HTTP API for the backend is documented with an OpenAPI spec and exposed via Swagger UI when the server is running.

How to open the docs

1. Start the backend server (example, default port 4001):

```powershell
npm run server:start -- 4001
# or: node ./dist/tools/server.js
```

2. Open the Swagger UI in your browser:

- URL: http://localhost:4001/docs
- Raw OpenAPI JSON: http://localhost:4001/openapi.json

Using the POST /download operation in Swagger UI

1. Click the `/download` POST operation and choose "Try it out".
2. Enter a request body. Example JSON:

```json
{
  "clientId": "my-restaurant-01",
  "destPath": "C:\\projects\\downloads\\downloaded.bin",
  "sizeMB": 100
}
```

- `clientId` must match a connected client.
- `destPath` is a path on the _server_ where the server will save the received file. The server will create parent directories if needed.
- `sizeMB` (optional) — when provided the server will instruct the client to generate a file of that size and wait for the client to ack before requesting the download.

3. Click `Execute`. Swagger UI will show the request and the server response (JSON). If the client is connected the server will return a success response when the transfer completes.

Notes and troubleshooting

- If Swagger UI shows an empty page or errors, check the server console for a warning about `openapi.json` (the server logs a message when the spec is absent or invalid).
- Ensure the server is reachable on the host/port used in the docs URL (use `localhost` when running locally).
- The Swagger UI in this demo is not protected by authentication. For production, secure the endpoints (I can add bearer auth and update the OpenAPI spec if you want).

For convenience, here's an end-to-end copyable example (PowerShell):

```powershell
# 1) ensure the client has a test file (or let the server ask the client to generate one)
node ./dist/tools/gen-file.js .\files\file_to_download.txt 100

# 2) start the server
node ./dist/tools/server.js

# 3) start the client (in another terminal)
npm run client:start -- my-restaurant-01 .\files\file_to_download.txt ws://127.0.0.1:4001/ws

# 4) open http://localhost:4001/docs and use POST /download, or run the trigger:
node ./dist/tools/trigger-download.js my-restaurant-01 .\downloads\downloaded.bin --size=100
```

- For production, protect the API routes (authentication) and use HTTPS/WSS. I can add bearer-token auth and update the OpenAPI spec if you want.
