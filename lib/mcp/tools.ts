import { MCPManager } from "./manager";

/**
 * 为英语学习场景封装的工具集
 */
export async function getEnrichedWordData(word: string) {
  const manager = MCPManager.getInstance();
  const results: Record<string, unknown> = {};

  try {
    // 1. 获取 Wikipedia 简介 (如果可用)
    // 假设你已经在环境变量中配置了 wikipedia mcp server
    if (process.env.MCP_WIKI_ENABLED === "true") {
      try {
        await manager.connectStdioServer(
          "wikipedia",
          "npx",
          ["-y", "@modelcontextprotocol/server-wikipedia"]
        );
        const wikiRes = await manager.callTool("wikipedia", "search", { query: word });
        results.wiki = wikiRes;
      } catch (e) {
        console.error("[MCP Enrichment] Wiki failed:", e);
      }
    }

    // 2. 获取 Google Search / Brave Search 的真实例句
    if (process.env.BRAVE_API_KEY) {
      try {
        await manager.connectStdioServer(
          "brave-search",
          "npx",
          ["-y", "@modelcontextprotocol/server-brave-search"],
          { BRAVE_API_KEY: process.env.BRAVE_API_KEY }
        );
        const searchRes = await manager.callTool("brave-search", "brave_web_search", { 
          query: `${word} meaning in a sentence examples` 
        });
        results.realExamples = searchRes;
      } catch (e) {
        console.error("[MCP Enrichment] Search failed:", e);
      }
    }

    // 3. 词源信息 (通过特定的词典 Server，这里作为示例)
    // results.etymology = "From Middle English...";

  } catch (error) {
    console.error("[MCP Enrichment] General error:", error);
  }

  return results;
}
