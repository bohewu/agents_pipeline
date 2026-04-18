import { createRequire } from "module";
import { tool } from "@opencode-ai/plugin";

const require = createRequire(import.meta.url);
const {
  createStatusRuntime,
  STATUS_RUNTIME_BATCH_EVENT,
  STATUS_RUNTIME_EVENTS
} = require("./status-runtime/index.js");
const { resolvePathFromBase, resolvePayloadPath } = require("./status-runtime/utils.js");

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
  const basePath = worktree || process.cwd();
  if (normalized.working_project_dir !== undefined) {
    normalized.working_project_dir = resolvePathFromBase(basePath, normalized.working_project_dir);
  }
  if (normalized.output_root !== undefined) {
    normalized.output_root = resolvePayloadPath(basePath, normalized, normalized.output_root);
  }
  if (normalized.checkpoint_path !== undefined) {
    normalized.checkpoint_path = resolvePayloadPath(basePath, normalized, normalized.checkpoint_path);
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
          event_count: result.event_count,
          coalesced: result.coalesced,
          coalesced_events: result.coalesced_events,
          run_id: result.run_id,
          run_dir: result.run_dir
        }
      }
    })
    .catch(() => undefined);
}

export const StatusRuntimePlugin = async ({ client, worktree }) => {
  const runtime = createStatusRuntime();

  function normalizeBatchPayload(batchPayload, currentWorktree) {
    const sharedPayload = batchPayload.shared_payload ?? {};
    if (!sharedPayload || typeof sharedPayload !== "object" || Array.isArray(sharedPayload)) {
      throw new Error("batch payload_json.shared_payload must decode to an object when provided");
    }

    if (!Array.isArray(batchPayload.events) || batchPayload.events.length === 0) {
      throw new Error("batch payload_json must include a non-empty events array");
    }

    return batchPayload.events.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`batch events[${index}] must be an object`);
      }
      if (!STATUS_RUNTIME_EVENTS.includes(entry.event)) {
        throw new Error(`Unsupported status runtime event in batch: ${entry.event}`);
      }

      const { event, payload, ...rest } = entry;
      const deltaPayload = payload === undefined ? rest : payload;
      if (!deltaPayload || typeof deltaPayload !== "object" || Array.isArray(deltaPayload)) {
        throw new Error(`batch events[${index}].payload must decode to an object`);
      }

      return {
        event,
        payload: normalizePayload({ ...sharedPayload, ...deltaPayload }, currentWorktree)
      };
    });
  }

  return {
    tool: {
      status_runtime_event: tool({
        description: "Write canonical status artifacts for a runtime lifecycle event.",
        args: {
          event: tool.schema.string().describe("Status runtime event name, or `batch` for ordered multi-event flush."),
          payload_json: tool.schema.string().describe("JSON object payload for the runtime event, or for `batch` a JSON object with optional `shared_payload` plus `events[]`.")
        },
        async execute(args, context) {
          if (args.event === STATUS_RUNTIME_BATCH_EVENT) {
            const batchPayload = parsePayload(args.payload_json);
            const events = normalizeBatchPayload(batchPayload, context.worktree || worktree);
            const result = await runtime.applyEvents(events);
            await logAppliedEvent(client, args.event, result);
            return JSON.stringify(result, null, 2);
          }

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
