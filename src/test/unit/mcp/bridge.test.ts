import { describe, it, expect, vi, afterEach } from "vitest";
import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { startBridge, type BridgeDeps } from "../../../mcp/bridge";

function request(
  port: number,
  method: string,
  urlPath: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode!, body: JSON.parse(text) });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("MCP Bridge", () => {
  let tmpDir: string;
  let handle: Awaited<ReturnType<typeof startBridge>> | undefined;
  let token: string;

  afterEach(async () => {
    handle?.dispose();
    handle = undefined;
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function start(overrides?: Partial<BridgeDeps>) {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oxveil-bridge-test-"));
    const deps: BridgeDeps = {
      workspaceRoot: tmpDir,
      buildFullState: () => ({ view: "ready", archives: [] }) as any,
      dispatchClick: vi.fn(),
      executeCommand: vi.fn(async () => {}),
      ...overrides,
    };
    handle = await startBridge(deps);
    // Read discovery file to get token
    const discovery = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".oxveil-mcp"), "utf-8"),
    );
    token = discovery.token;
    return { deps, discovery };
  }

  it("writes discovery file with port, token, version, pid", async () => {
    const { discovery } = await start();
    expect(discovery.port).toBeGreaterThan(0);
    expect(discovery.token).toHaveLength(64);
    expect(discovery.version).toBe(1);
    expect(discovery.pid).toBe(process.pid);
  });

  it("rejects requests without auth token", async () => {
    await start();
    const res = await request(handle!.port, "GET", "/health", "wrong-token");
    expect(res.status).toBe(401);
  });

  it("GET /health returns ok", async () => {
    await start();
    const res = await request(handle!.port, "GET", "/health", token);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toBe(1);
  });

  it("GET /state returns sidebar state", async () => {
    await start();
    const res = await request(handle!.port, "GET", "/state", token);
    expect(res.status).toBe(200);
    expect(res.body.view).toBe("ready");
  });

  it("POST /click dispatches sidebar command", async () => {
    const dispatchClick = vi.fn();
    await start({ dispatchClick });
    const res = await request(handle!.port, "POST", "/click", token, { command: "start" });
    expect(res.status).toBe(200);
    expect(dispatchClick).toHaveBeenCalledWith({ command: "start" });
  });

  it("POST /command executes VS Code command", async () => {
    const executeCommand = vi.fn(async () => {});
    await start({ executeCommand });
    const res = await request(handle!.port, "POST", "/command", token, {
      command: "oxveil.start",
      args: [],
    });
    expect(res.status).toBe(200);
    expect(executeCommand).toHaveBeenCalledWith("oxveil.start");
  });

  it("returns 404 for unknown routes", async () => {
    await start();
    const res = await request(handle!.port, "GET", "/unknown", token);
    expect(res.status).toBe(404);
  });

  it("returns 500 when handler throws", async () => {
    await start({
      buildFullState: () => { throw new Error("boom"); },
    });
    const res = await request(handle!.port, "GET", "/state", token);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("boom");
  });

  it("deletes discovery file on dispose", async () => {
    await start();
    const discoveryPath = path.join(tmpDir, ".oxveil-mcp");
    await fs.access(discoveryPath); // exists
    handle!.dispose();
    handle = undefined;
    await expect(fs.access(discoveryPath)).rejects.toThrow();
  });
});
