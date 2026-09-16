import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


class DebuggerWorkflowContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.shared = read("protocols/DEBUGGER_DELEGATION.md")
        self.simple = read("agents/orchestrator-simple.md")
        self.flow = read("agents/orchestrator-flow.md")
        self.pipeline = read("agents/orchestrator-pipeline.md")
        self.general = read("agents/orchestrator-general.md")
        self.adaptive = read("skills/run-adaptive/SKILL.md")
        self.reasoning = read("protocols/REASONING_POLICY.md")

    def test_relevant_workflows_use_one_shared_diagnosis_boundary(self) -> None:
        for name, text in (
            ("simple", self.simple),
            ("flow", self.flow),
            ("pipeline", self.pipeline),
            ("general", self.general),
            ("adaptive", self.adaptive),
        ):
            with self.subTest(workflow=name):
                self.assertIn("protocols/DEBUGGER_DELEGATION.md", text)
                self.assertIn("@debugger", text)

        self.assertIn("task_intent = diagnose", self.shared)
        self.assertIn("tools/reasoning-policy.js", self.shared)
        self.assertIn("existing LSA v2", self.shared)
        self.assertNotIn("gpt-", self.shared.lower())
        self.assertNotIn("sol high", self.shared.lower())

    def test_admission_routes_uncertain_work_before_broad_main_investigation(self) -> None:
        self.assertIn("clear, localized same-task defect", self.shared)
        self.assertIn("root cause remains materially uncertain", self.shared)
        self.assertIn("including within one module", self.shared)
        self.assertIn("evidence crosses module or system boundaries", self.shared)
        self.assertIn("non-local invariant", self.shared)
        self.assertIn("earlier attempts conflict", self.shared)
        self.assertIn("before the orchestrator performs a broad causal", self.shared)
        self.assertIn("An explicit diagnosis\n  deliverable is an ordinary Simple work item", self.shared)
        self.assertIn("diagnosis prompted by a failed task", self.pipeline)
        self.assertIn("direct structural lookup", self.shared)
        self.assertIn("does not by itself\njustify a debugger dispatch", self.shared)

    def test_simple_admits_one_bounded_diagnosis_in_its_existing_recovery(self) -> None:
        self.assertIn("single existing narrow same-scope recovery sequence", self.simple)
        self.assertIn("at most one bounded `@debugger` diagnosis in memory", self.simple)
        self.assertIn("before any broad current-agent causal investigation", self.simple)
        self.assertIn("actionable same-scope fix", self.simple)
        self.assertIn("remaining repair/recovery budgets", self.simple)
        self.assertIn("create no workflow artifact or additional retry/recovery lane", self.simple)
        self.assertIn("a second failure stops", self.simple)
        self.assertNotIn(
            "attempt one narrow recovery only when the fix is obvious; otherwise report the blocker",
            self.simple,
        )

    def test_known_harness_and_operational_failures_do_not_auto_escalate(self) -> None:
        self.assertIn("known harness or\noperational failure", self.shared)
        self.assertIn("do not dispatch a debugger merely to make such", self.shared)
        for name, text in (
            ("flow", self.flow),
            ("pipeline", self.pipeline),
            ("general", self.general),
        ):
            with self.subTest(workflow=name):
                self.assertRegex(text, r"Known harness\s+and operational failures")

    def test_debugger_preserves_orchestrator_authority_and_hard_stops(self) -> None:
        for authority in (
            "scope",
            "admission",
            "acceptance",
            "repair",
            "retry",
            "recovery",
            "stop decisions",
        ):
            self.assertIn(authority, self.shared)
        self.assertIn("diagnosis-only leaf", self.shared)
        self.assertRegex(self.shared, r"Leaf workers\s+never dispatch the debugger")
        self.assertIn("cannot\nrestart a stopped task", self.shared)
        self.assertIn("does not add a retry, repair, recovery, or\nvalidation lane", self.shared)

    def test_flow_and_pipeline_bind_diagnosis_to_existing_task_history(self) -> None:
        self.assertIn("the original `task_id` and an explicit attempt number", self.shared)
        self.assertIn("persist `flow_recovery_used` before the debugger starts", self.shared)
        self.assertIn("the one existing\n  Flow recovery pass", self.shared)
        self.assertIn("`retry_opportunities_used` before the debugger spawn", self.shared)
        self.assertIn("A later executor re-dispatch consumes the next existing", self.shared)
        self.assertIn("never recreate it as a free attempt", self.shared)
        self.assertIn("The debugger AgentStatus is additive", self.shared)
        self.assertIn("terminal executor AgentStatus", self.shared)
        self.assertIn("source failure-history entry", self.shared)

        self.assertIn("persist `flow_recovery_used` before the spawn", self.flow)
        self.assertIn("the one existing Flow\nrecovery pass", self.flow)
        self.assertIn("atomically incrementing that task's existing", self.pipeline)
        self.assertIn("`retry_opportunities_used` before the spawn", self.pipeline)

    def test_reasoning_prose_uses_diagnose_intent_without_main_session_advice(self) -> None:
        self.assertIn("`debugger` is an on-demand diagnosis-only role", self.reasoning)
        self.assertIn("`task_intent = diagnose`", self.reasoning)
        self.assertIn("`ambiguous_root_cause`", self.reasoning)
        self.assertIn("`cross_module`", self.reasoning)
        self.assertIn("`non_local_invariant`", self.reasoning)
        self.assertIn("does not prescribe or change the\ncurrent/main session model or effort", self.reasoning)


if __name__ == "__main__":
    unittest.main()
