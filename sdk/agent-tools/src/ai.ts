/** Vercel AI SDK adapter: `const tools = await stoaAiTools(); generateText({ model, tools, prompt })` */
import { jsonSchema, tool, type ToolSet } from "ai";
import { callTool, listTools, type StoaOptions } from "./index.js";

export async function stoaAiTools(o: StoaOptions = {}) {
  const defs = await listTools(o);
  const out: ToolSet = {};
  for (const d of defs) {
    out[d.name] = (tool as any)({
      description: d.description,
      inputSchema: jsonSchema(d.inputSchema as any),
      execute: async (args: any) => callTool(d.name, args ?? {}, o),
    });
  }
  return out;
}
