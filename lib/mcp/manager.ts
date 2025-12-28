import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * 通用 MCP 客户端封装
 * 用于在 Next.js 后端连接并调用各种 MCP Server
 */
export class MCPManager {
  private static instance: MCPManager;
  private clients: Map<string, Client> = new Map();

  private constructor() {}

  public static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  /**
   * 初始化并连接一个 Stdio 模式的 MCP Server
   * @param name Server 名称
   * @param command 命令 (如 node, python)
   * @param args 参数
   * @param env 环境变量
   */
  public async connectStdioServer(
    name: string,
    command: string,
    args: string[] = [],
    env: Record<string, string> = {}
  ) {
    if (this.clients.has(name)) return this.clients.get(name);

    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, ...env } as Record<string, string>,
    });

    const client = new Client(
      {
        name: "Snapshot-App-Client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    this.clients.set(name, client);
    console.log(`[MCP] Connected to ${name}`);
    return client;
  }

  /**
   * 调用特定 Server 的工具
   */
  public async callTool(serverName: string, toolName: string, args: Record<string, unknown>) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP Server ${serverName} not connected`);
    }

    return await client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  /**
   * 关闭所有连接
   */
  public async disconnectAll() {
    for (const [name] of this.clients) {
      // 这里的断开逻辑取决于具体 SDK 版本，通常是销毁 transport
      this.clients.delete(name);
    }
  }
}
