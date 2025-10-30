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

- For production, protect the API routes (authentication) and use HTTPS/WSS. I can add bearer-token auth and update the OpenAPI spec if you want.
