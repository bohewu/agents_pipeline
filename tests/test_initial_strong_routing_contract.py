import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = REPO_ROOT / "protocols" / "INITIAL_STRONG_ROUTING.md"


def read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def normalize(value: str) -> str:
    return " ".join(value.split())


class InitialStrongRoutingContractTest(unittest.TestCase):
    def assert_contains_normalized(self, member: str, container: str) -> None:
        self.assertIn(normalize(member), normalize(container))

    def test_one_shared_protocol_owns_the_complete_admission_gate(self) -> None:
        protocol = PROTOCOL.read_text(encoding="utf-8")
        shared = [
            path
            for path in (REPO_ROOT / "protocols").glob("*.md")
            if "INITIAL_STRONG_ROUTING" in path.name
        ]

        self.assertEqual(shared, [PROTOCOL])
        for phrase in (
            "`health = ok`",
            "`profile_eligibility = eligible`",
            "`catalog_state = current`",
            "`balanced` or `premium`",
            "exact `executor-strong` role binding",
            "`model_tier = strong`",
            "workspace-profile provenance",
            "same saved model-set mapping and reasoning-projection identities",
            "no implementation attempt has started",
            "resolved reasoning class is `deep`",
            "current/main orchestrator owns the final decision",
        ):
            with self.subTest(phrase=phrase):
                self.assert_contains_normalized(phrase, protocol)

    def test_difficulty_gate_has_positive_evidence_and_negative_boundaries(self) -> None:
        protocol = PROTOCOL.read_text(encoding="utf-8")

        for signal in (
            "cross_system",
            "architectural_tradeoff",
            "non_local_invariant",
            "adversarial_input",
            "numerical_sensitivity",
            "security_boundary",
            "data_integrity",
            "concurrency_or_ordering",
            "migration_compatibility",
        ):
            with self.subTest(signal=signal):
                self.assertIn(f"`{signal}`", protocol)

        for insufficient in (
            "Task size",
            "`multi_file`",
            "`cross_module`",
            "a high-risk label",
            "or a `deep` label\nalone is insufficient",
        ):
            with self.subTest(insufficient=insufficient):
                self.assert_contains_normalized(insufficient, protocol)

        for preserved_boundary in (
            "frugal profile",
            "a retired model set or projection",
            "explicitly selected the ordinary executor path, Sol",
            "retain the workflow's existing `executor` or `generalist` choice",
            "explicitly requires strong execution",
            "instead of silently routing to\na weaker role",
        ):
            with self.subTest(boundary=preserved_boundary):
                self.assert_contains_normalized(preserved_boundary, protocol)

    def test_history_uses_records_and_preserves_attempt_identity(self) -> None:
        protocol = PROTOCOL.read_text(encoding="utf-8")

        for phrase in (
            "persisted TaskStatus",
            "every started or terminal AgentStatus record",
            "orchestrator-owned\nin-memory dispatch record",
            "Do not replace them with caller-supplied booleans",
            "started or\n   terminal `executor`, `generalist`, or `executor-strong` record",
            "diagnosis-only helper records do not become implementation\n   attempts",
            "failed `executor` or `generalist` attempt cannot switch to `executor-strong`",
            "began with `executor-strong` retains that role",
        ):
            with self.subTest(phrase=phrase):
                self.assert_contains_normalized(phrase, protocol)

    def test_initial_strong_is_not_recovery_or_a_model_override(self) -> None:
        protocol = PROTOCOL.read_text(encoding="utf-8")

        for phrase in (
            "It is not capability recovery",
            "does not control the current/main agent",
            "does not set recovery provenance",
            "consume a\ncapability-recovery uplift",
            "increment a retry or repair counter",
            "never pass a raw model",
            "recovery remains limited to `executor` and `generalist`",
            "does not make `executor-strong` recovery-eligible",
        ):
            with self.subTest(phrase=phrase):
                self.assert_contains_normalized(phrase, protocol)

    def test_router_and_flow_splitter_receive_authoritative_context(self) -> None:
        router = read("agents/router.md")
        splitter = read("agents/flow-splitter.md")

        for prompt in (router, splitter):
            with self.subTest(prompt="router" if prompt == router else "flow-splitter"):
                self.assertIn("protocols/INITIAL_STRONG_ROUTING.md", prompt)
                self.assert_contains_normalized("actual profile-manager status", prompt)
                self.assert_contains_normalized("started or terminal AgentStatus", prompt)
                self.assert_contains_normalized("orchestrator-owned in-memory dispatch record", prompt)
                self.assertRegex(prompt, r"first[-_]attempt")
                self.assertIn("boolean", prompt)
                self.assert_contains_normalized("`multi_file`, `cross_module`, task size, risk, or `deep` alone", prompt)
                self.assert_contains_normalized("unavailable binding is a", prompt)
                self.assertIn("downgrade", prompt)

        self.assertIn(
            '"assigned_agent": "executor | executor-strong | doc-writer | peon | generalist"',
            splitter,
        )

    def test_all_applicable_workflows_reference_and_recheck_the_shared_gate(self) -> None:
        workflows = {
            "simple": read("agents/orchestrator-simple.md"),
            "flow": read("agents/orchestrator-flow.md"),
            "pipeline": read("agents/orchestrator-pipeline.md"),
            "general": read("agents/orchestrator-general.md"),
            "adaptive": read("skills/run-adaptive/SKILL.md"),
        }

        for name, body in workflows.items():
            with self.subTest(workflow=name):
                self.assertIn("protocols/INITIAL_STRONG_ROUTING.md", body)
                self.assertIn("executor-strong", body)
                self.assert_contains_normalized("immediately before spawn", body.lower())

        for name in ("simple", "flow", "pipeline", "general"):
            with self.subTest(normal_initial_attempt=name):
                self.assert_contains_normalized("normal first", workflows[name].lower())
        self.assertIn("not capability recovery", workflows["adaptive"].lower())

        for name in ("simple", "flow", "pipeline", "general"):
            with self.subTest(role_identity=name):
                if name == "simple":
                    self.assert_contains_normalized(
                        "`executor` or `generalist` attempt cannot become a fresh "
                        "`executor-strong` attempt", workflows[name]
                    )
                    self.assert_contains_normalized(
                        "Capability recovery remains unavailable to Simple and "
                        "never applies to `executor-strong`", workflows[name]
                    )
                else:
                    self.assertIn("cannot switch", workflows[name])
                    self.assert_contains_normalized(
                        "not eligible for model capability recovery", workflows[name]
                    )

    def test_profile_documentation_keeps_initial_selection_separate(self) -> None:
        docs = read("docs/runtime-agent-model-profiles.md")

        self.assertIn("### Initial strong implementation routing", docs)
        self.assertIn("protocols/INITIAL_STRONG_ROUTING.md", docs)
        self.assert_contains_normalized("does not consume capability recovery", docs)
        self.assert_contains_normalized(
            "does not consume capability recovery, change counters or budgets, "
            "request a model uplift, or control the main-session model or effort.",
            docs,
        )
        self.assert_contains_normalized("model recovery remains available only to `executor` and `generalist`", docs)
        self.assertIn("sole model-uplift exception", docs)


if __name__ == "__main__":
    unittest.main()
