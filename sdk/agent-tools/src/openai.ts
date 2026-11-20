/** OpenAI function calling, no extra dependency:
 *    const s = await stoaOpenAITools();
 *    client.chat.completions.create({ model, messages, tools: s.tools })   // or s.responsesTools for the Responses API
 *    for (const c of msg.tool_calls) await s.call(c.function.name, c.function.arguments) */
import { callTool, listTools, type StoaOptions } from "./index.js";

export async function stoaOpenAITools(o: StoaOptions = {}) {
  const defs = await listTools(o);
  return {
    /** Chat Completions format */
    tools: defs.map((d) => ({ type: "function" as const, function: { name: d.name, description: d.description, parameters: d.inputSchema } })),
    /** Responses API format */
    responsesTools: defs.map((d) => ({ type: "function" as const, name: d.name, description: d.description, parameters: d.inputSchema })),
    /** Run a tool call; `args` may be the JSON string the model returned. Returns a JSON string for the tool message. */
    call: async (name: string, args: string | Record<string, unknown>) => {
      try {
        return JSON.stringify(await callTool(name, typeof args === "string" ? (args ? JSON.parse(args) : {}) : args, o));
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message });
      }
    },
  };
}
