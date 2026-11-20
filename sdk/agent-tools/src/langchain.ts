/** LangChain adapter: `const tools = await stoaLangChainTools(); createAgent({ model, tools })` */
import { tool } from "@langchain/core/tools";
import { callTool, listTools, type StoaOptions } from "./index.js";

export async function stoaLangChainTools(o: StoaOptions = {}) {
  const defs = await listTools(o);
  return defs.map((d) =>
    tool(async (args: Record<string, unknown>) => JSON.stringify(await callTool(d.name, args ?? {}, o)), {
      name: d.name, description: d.description, schema: d.inputSchema as any,
    }),
  );
}
