import path from "path";
import { createRequire } from "module";
import { tool } from "@opencode-ai/plugin";

const require = createRequire(import.meta.url);
const { createStatusRuntime, STATUS_RUNTIME_EVENTS } = require("./status-runtime/index.js");

function resolvePath(worktree, value) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.join(worktree || process.cwd(), value);
}

function parsePayload(payloadJson) {
  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch (error) {
    throw new Error(`payload_json must be valid JSON: ${error.message}`);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("payload_json must decode to an object");
  }

  return payload;
}

function normalizePayload(payload, worktree) {
  const normalized = { ...payload };
  if (normalized.output_root !== undefined) {
    normalized.output_root = resolvePath(worktree, normalized.output_root);
  }
  if (normalized.checkpoint_path !== undefined) {
    normalized.checkpoint_path = resolvePath(worktree, normalized.checkpoint_path);
  }
  return normalized;
}

async function logAppliedEvent(client, event, result) {
  if (!client?.app?.log) {
    return;
  }

  await client.app
    .log({
      body: {
        service: "status-runtime",
        level: "debug",
        message: "Applied status runtime event",
        extra: {
          event,
          run_id: result.run_id,
          run_dir: result.run_dir
        }
      }
    })
    .catch(() => undefined);
}

export const StatusRuntimePlugin = async ({ client, worktree }) => {
  const runtime = createStatusRuntime();

  return {
    tool: {
      status_runtime_event: tool({
        description: "Write canonical status artifacts for a runtime lifecycle event.",
        args: {
          event: tool.schema.string().describe("Status runtime event name."),
          payload_json: tool.schema.string().describe("JSON object payload for the runtime event.")
        },
        async execute(args, context) {
          if (!STATUS_RUNTIME_EVENTS.includes(args.event)) {
            throw new Error(`Unsupported status runtime event: ${args.event}`);
          }

          const payload = normalizePayload(parsePayload(args.payload_json), context.worktree || worktree);
          const result = await runtime.applyEvent(args.event, payload);
          await logAppliedEvent(client, args.event, result);
          return JSON.stringify(result, null, 2);
        }
      })
    }
  };
};

export const OpenCodeStatusRuntimePlugin = StatusRuntimePlugin;
