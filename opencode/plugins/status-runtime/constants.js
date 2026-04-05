const PROTOCOL_VERSION = "1.0";

const RUN_STATUSES = [
  "queued",
  "running",
  "waiting_for_user",
  "completed",
  "partial",
  "failed",
  "aborted",
  "stale"
];

const TASK_STATUSES = [
  "pending",
  "ready",
  "in_progress",
  "waiting_for_user",
  "done",
  "blocked",
  "failed",
  "skipped",
  "stale"
];

const AGENT_STATUSES = [
  "assigned",
  "starting",
  "running",
  "waiting_for_user",
  "done",
  "blocked",
  "failed",
  "stale"
];

const STAGE_STATUSES = ["completed", "skipped", "failed"];
const WAITING_ON = ["user", "dependency", "cleanup", "resume", "none"];
const RESOURCE_CLASSES = ["light", "process", "server", "browser"];
const RESOURCE_STATUSES = [
  "not_required",
  "reserved",
  "starting",
  "running",
  "teardown_pending",
  "cleaned",
  "cleanup_failed",
  "unknown"
];
const CLEANUP_STATUSES = ["not_required", "pending", "in_progress", "cleaned", "failed", "unknown"];

const ORCHESTRATORS = [
  "orchestrator-pipeline",
  "orchestrator-flow",
  "orchestrator-ci",
  "orchestrator-modernize",
  "orchestrator-spec",
  "orchestrator-committee",
  "orchestrator-general",
  "orchestrator-ux"
];

const TASK_COUNT_ORDER = [
  "pending",
  "ready",
  "in_progress",
  "waiting_for_user",
  "done",
  "blocked",
  "failed",
  "skipped",
  "stale"
];

const RUN_KEY_ORDER = [
  "protocol_version",
  "run_id",
  "orchestrator",
  "status",
  "created_at",
  "updated_at",
  "output_dir",
  "checkpoint_path",
  "user_prompt",
  "current_stage",
  "completed_stages",
  "next_stage",
  "task_list_path",
  "dispatch_plan_path",
  "layout",
  "task_counts",
  "active_task_ids",
  "active_agent_ids",
  "waiting_on",
  "resume_from_checkpoint",
  "last_heartbeat_at",
  "last_error",
  "notes",
  "task_refs",
  "agent_refs"
];

const TASK_KEY_ORDER = [
  "protocol_version",
  "run_id",
  "task_id",
  "summary",
  "status",
  "created_at",
  "updated_at",
  "trace_ids",
  "batch_id",
  "depends_on",
  "assigned_agent_id",
  "assigned_executor",
  "resource_class",
  "max_parallelism",
  "teardown_required",
  "resource_status",
  "started_at",
  "completed_at",
  "last_heartbeat_at",
  "result_summary",
  "evidence_refs",
  "error",
  "resume_note",
  "agent_ref"
];

const AGENT_KEY_ORDER = [
  "protocol_version",
  "run_id",
  "agent_id",
  "agent",
  "status",
  "created_at",
  "updated_at",
  "task_id",
  "batch_id",
  "attempt",
  "started_at",
  "completed_at",
  "last_heartbeat_at",
  "resource_class",
  "resource_status",
  "teardown_required",
  "resource_handles",
  "cleanup_status",
  "result_summary",
  "evidence_refs",
  "error"
];

const CHECKPOINT_KEY_ORDER = [
  "protocol_version",
  "pipeline_id",
  "orchestrator",
  "user_prompt",
  "flags",
  "current_stage",
  "completed_stages",
  "stage_artifacts",
  "created_at",
  "updated_at"
];

module.exports = {
  AGENT_KEY_ORDER,
  AGENT_STATUSES,
  CHECKPOINT_KEY_ORDER,
  CLEANUP_STATUSES,
  ORCHESTRATORS,
  PROTOCOL_VERSION,
  RESOURCE_CLASSES,
  RESOURCE_STATUSES,
  RUN_KEY_ORDER,
  RUN_STATUSES,
  STAGE_STATUSES,
  TASK_COUNT_ORDER,
  TASK_KEY_ORDER,
  TASK_STATUSES,
  WAITING_ON
};
