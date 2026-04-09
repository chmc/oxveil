#!/usr/bin/env node
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const CONNECT_TIMEOUT = 5000;

interface Discovery {
  port: number;
  token: string;
  version: number;
  pid: number;
}

function getWorkspaceRoot(): string {
  const root = process.env.OXVEIL_WORKSPACE || process.argv[2];
  if (!root) {
    throw new Error("Set OXVEIL_WORKSPACE env var or pass workspace path as first argument");
  }
  return root;
}

function readDiscovery(workspaceRoot: string): Discovery | null {
  const filePath = path.join(workspaceRoot, ".oxveil-mcp");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Discovery;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function bridgeRequest(
  discovery: Discovery,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: discovery.port,
        path: urlPath,
        method,
        headers: {
          Authorization: `Bearer ${discovery.token}`,
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: CONNECT_TIMEOUT,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          try {
            resolve(JSON.parse(text));
          } catch {
            resolve(text);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Bridge request timed out"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function callBridge(
  workspaceRoot: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  // Re-read discovery on every call to handle extension reloads
  const discovery = readDiscovery(workspaceRoot);
  if (!discovery) {
    throw new Error(
      "Oxveil bridge not running. Enable the oxveil.mcpBridge setting in VS Code and reload.",
    );
  }
  if (!isPidAlive(discovery.pid)) {
    throw new Error(
      "Oxveil bridge process is stale (VS Code may have closed). Restart VS Code and try again.",
    );
  }
  try {
    return await bridgeRequest(discovery, method, urlPath, body);
  } catch (err: unknown) {
    // Retry once after re-reading discovery (extension may have reloaded)
    const fresh = readDiscovery(workspaceRoot);
    if (fresh && fresh.port !== discovery.port) {
      return await bridgeRequest(fresh, method, urlPath, body);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();

  const server = new McpServer({
    name: "oxveil",
    version: "0.1.0",
  });

  server.tool(
    "get_sidebar_state",
    "Get the current Oxveil sidebar state including view type, plan info, session status, and archives",
    {},
    async () => {
      const state = await callBridge(workspaceRoot, "GET", "/state");
      return { content: [{ type: "text", text: JSON.stringify(state, null, 2) }] };
    },
  );

  server.tool(
    "click_sidebar_button",
    "Simulate clicking a sidebar button. Common commands: start, stop, resume, restart, resumePlan, dismissPlan, discardPlan, createPlan, editPlan. For phase commands add phase parameter. Response confirms dispatch only — poll get_sidebar_state to verify the effect.",
    {
      command: z.string().describe("The sidebar command to dispatch (e.g. 'start', 'stop', 'resumePlan')"),
      phase: z.number().optional().describe("Phase number for phase-specific commands (resume, retry, skip)"),
      archive: z.string().optional().describe("Archive name for archive commands (openReplay, restoreArchive)"),
    },
    async ({ command, phase, archive }) => {
      const msg: Record<string, unknown> = { command };
      if (phase !== undefined) msg.phase = phase;
      if (archive !== undefined) msg.archive = archive;
      const result = await callBridge(workspaceRoot, "POST", "/click", msg);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "execute_command",
    "Execute any registered VS Code command (e.g. 'oxveil.start', 'oxveil.openConfigWizard', 'workbench.action.openSettings')",
    {
      command: z.string().describe("The VS Code command ID to execute"),
      args: z.array(z.any()).optional().describe("Arguments to pass to the command"),
    },
    async ({ command, args }) => {
      const result = await callBridge(workspaceRoot, "POST", "/command", { command, args });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Oxveil MCP server error: ${err.message}\n`);
  process.exit(1);
});
