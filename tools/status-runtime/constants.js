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
  "orchestrator-analysis",
  "orchestrator-modernize",
  "orchestrator-spec",
  "orchestrator-simple",
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
  "task_intent",
  "intent_baseline_class",
  "classification_source",
  "prior_failure_type",
  "allow_degraded_deep",
  "retry_opportunities_used",
  "capability_recovery_used",
  "reasoning_class",
  "reasoning_signals",
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
  "reasoning",
  "result_summary",
  "evidence_refs",
  "error"
];

const REASONING_DECISION_KEY_ORDER = [
  "schema_version",
  "policy_version",
  "mode",
  "role",
  "task_intent",
  "intent_baseline_class",
  "classification_source",
  "role_policy",
  "dispatch_context",
  "requested_class",
  "reasoning_class",
  "effective_class",
  "reasoning_signals",
  "model_tier",
  "selected_model_tier",
  "minimum_model_tier",
  "requires_model_escalation",
  "requested_effort",
  "dispatch_effort",
  "effective_effort",
  "selector_available",
  "capability_source",
  "enforcement_status",
  "strict",
  "degraded",
  "degradation_reason",
  "recovery_boost",
  "explicit_override",
  "reasons",
  "conflict",
  "conflict_reason"
];

const REASONING_OBSERVATION_KEY_ORDER = [
  "schema_version",
  "observed_at",
  "run_id",
  "orchestrator",
  "task_id",
  "agent_id",
  "attempt",
  "outcome",
  "wall_time_ms",
  "reasoning"
];

const REASONING_OBSERVATION_DECISION_KEY_ORDER = REASONING_DECISION_KEY_ORDER.filter(
  (key) => key !== "reasons" && key !== "conflict" && key !== "conflict_reason"
);

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
  REASONING_DECISION_KEY_ORDER,
  REASONING_OBSERVATION_DECISION_KEY_ORDER,
  REASONING_OBSERVATION_KEY_ORDER,
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
