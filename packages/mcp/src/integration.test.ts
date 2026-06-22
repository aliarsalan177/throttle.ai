import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.js";

/** Full MCP round-trip over the SDK's in-memory transport (no stdio needed). */
async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const { server, store } = createMcpServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, store };
}

describe("MCP server (live protocol)", () => {
  it("advertises the context tools to a connected client", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["context.get", "context.put"]);
  });

  it("stores via context.put and expands via context.get", async () => {
    const { client } = await connectedClient();
    const putRes = (await client.callTool({
      name: "context.put",
      arguments: { content: "a big stable context block", label: "stack" },
    })) as { content: Array<{ text: string }> };
    const { id } = JSON.parse(putRes.content[0]!.text);
    expect(id).toMatch(/^ctx_/);

    const getRes = (await client.callTool({ name: "context.get", arguments: { id } })) as {
      content: Array<{ text: string }>;
    };
    expect(getRes.content[0]!.text).toBe("a big stable context block");
  });

  it("reports an error for an unknown id", async () => {
    const { client } = await connectedClient();
    const res = (await client.callTool({ name: "context.get", arguments: { id: "ctx_missing" } })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
  });
});
