import { tool } from "@opencode-ai/plugin";
import path from "path";

function resolvePath(worktree: string, value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.join(worktree, value);
}

export default tool({
  description: "Validate a JSON file against a protocol schema.",
  args: {
    schema: tool.schema.string().describe("Path to a JSON schema file."),
    input: tool.schema.string().describe("Path to a JSON input file.")
  },
  async execute(args, context) {
    const schemaPath = resolvePath(context.worktree, args.schema);
    const inputPath = resolvePath(context.worktree, args.input);
    const scriptPath = path.join(context.worktree, ".opencode", "tools", "validate-schema.py");

    const result = await Bun.$`python ${scriptPath} --schema ${schemaPath} --input ${inputPath}`.text();
    return result.trim();
  }
});
