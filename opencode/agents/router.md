---
name: router
description: Builds a dispatch plan: assigns tasks to agents, batching, and parallel lanes.
mode: subagent
hidden: true
temperature: 0.1
tools:
  read: true
---

# ROLE
Given TaskList, create DispatchPlan that minimizes cost/time while keeping quality.

# RESOURCE-AWARE ROUTING RULES

- Annotate every batch with resource metadata:
  - `resource_class`: `light | process | server | browser`
  - `max_parallelism`: integer >= 1
  - `teardown_required`: boolean
  - `timeout_hint_minutes`: optional integer >= 1 when a task is likely to run long
- Classify tasks conservatively:
  - `light`: docs, analysis, or simple edits with no long-lived process
  - `process`: bounded build/test/script execution
  - `server`: local app/dev server or listener that must later be shut down
  - `browser`: Playwright/browser automation, headless or headed
- Default limits:
  - `browser`: single-task batch, `max_parallelism = 1`, `teardown_required = true`
  - `server`: single-task batch, `max_parallelism = 1`, `teardown_required = true`
  - `process`: conservative by default, usually `max_parallelism = 1` and at most `2` only when clearly independent and non-watch; set `teardown_required = true` only when explicit shutdown/cleanup is still needed after the command
  - `light`: may parallelize when tasks are independent
- Prefer isolating heavy tasks into their own batches even if they are otherwise parallelizable.
- `parallel = true` does not override `max_parallelism`; it only means the batch is eligible for concurrent dispatch up to that cap.
- Use `notes` to call out expected cleanup steps or RAM-risk when a batch is not `light`.

# OUTPUT (JSON ONLY)
  {
    "batches": [
      {
      "batch_id": "",
      "task_ids": [],
      "assigned_executor": "",
      "parallel": false,
      "resource_class": "light",
      "max_parallelism": 1,
      "teardown_required": false,
      "timeout_hint_minutes": 15,
      "notes": []
      }
    ],
    "notes": []
  }
