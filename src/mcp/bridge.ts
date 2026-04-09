import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import type { SidebarState } from "../views/sidebarState";
import type { SidebarCommand } from "../views/sidebarMessages";

const MAX_BODY = 65536;
const PROTOCOL_VERSION = 1;

export interface BridgeDeps {
  workspaceRoot: string;
  buildFullState: () => SidebarState;
  dispatchClick: (msg: SidebarCommand) => void;
  executeCommand: (cmd: string, ...args: any[]) => Thenable<any>;
}

export interface BridgeHandle {
  port: number;
  dispose(): void;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

export async function startBridge(deps: BridgeDeps): Promise<BridgeHandle> {
  const token = randomBytes(32).toString("hex");
  const discoveryPath = path.join(deps.workspaceRoot, ".oxveil-mcp");

  const server = http.createServer(async (req, res) => {
    // Auth check
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }

    try {
      const url = req.url ?? "/";
      const method = req.method ?? "GET";

      if (method === "GET" && url === "/health") {
        json(res, 200, { ok: true, version: PROTOCOL_VERSION, pid: process.pid });
        return;
      }

      if (method === "GET" && url === "/state") {
        json(res, 200, deps.buildFullState());
        return;
      }

      if (method === "POST" && url === "/click") {
        const body = JSON.parse(await readBody(req));
        deps.dispatchClick(body as SidebarCommand);
        json(res, 200, { ok: true });
        return;
      }

      if (method === "POST" && url === "/command") {
        const body = JSON.parse(await readBody(req));
        const { command, args } = body as { command: string; args?: any[] };
        await deps.executeCommand(command, ...(args ?? []));
        json(res, 200, { ok: true });
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: msg });
    }
  });

  // Set request timeout
  server.timeout = 5000;

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  // Write discovery file
  const discovery = JSON.stringify({
    port,
    token,
    version: PROTOCOL_VERSION,
    pid: process.pid,
  });
  await fs.writeFile(discoveryPath, discovery, { mode: 0o600 });

  return {
    port,
    dispose() {
      server.close();
      fs.unlink(discoveryPath).catch(() => {});
    },
  };
}
