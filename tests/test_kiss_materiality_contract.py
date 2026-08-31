import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


class KissMaterialityContractTest(unittest.TestCase):
    def test_implementation_roles_require_the_smallest_sufficient_path(self) -> None:
        for relative_path in ("agents/executor.md", "agents/generalist.md"):
            text = read(relative_path)
            with self.subTest(relative_path=relative_path):
                self.assertIn(
                    "Use the smallest implementation and verification sufficient",
                    text,
                )
                self.assertIn("Before adding a helper, abstraction, dependency", text)
                self.assertIn("do not generalize a single use case", text)
                self.assertIn("Once the", text)
                self.assertIn("required verification pass, stop", text)

    def test_implementation_roles_bound_verification_to_changed_behavior(self) -> None:
        executor = read("agents/executor.md")
        generalist = read("agents/generalist.md")

        self.assertIn("smallest verification set", executor)
        self.assertIn("Adequate targeted evidence is a stop condition", executor)
        self.assertIn("smallest verification set", generalist)
        self.assertIn("targeted checks cannot cover a changed shared boundary", generalist)

    def test_reviewer_omits_preferences_and_unproven_findings(self) -> None:
        reviewer = read("agents/reviewer.md")

        self.assertIn("It is not a search for every possible improvement", reviewer)
        self.assertIn("different implementation or architecture as a preference", reviewer)
        self.assertIn("If any is missing, omit it", reviewer)
        self.assertIn("do not demand a full suite", reviewer)
        self.assertIn("not automatic authorization to edit", reviewer)

    def test_materiality_gate_requires_the_smallest_closing_action(self) -> None:
        materiality = read("protocols/MATERIALITY_GATE.md")

        self.assertIn("review failure is evidence to evaluate", materiality)
        self.assertIn("no smaller change or targeted verification", materiality)
        self.assertIn(
            "What is the smallest change or verification step that closes the gap?",
            materiality,
        )
        self.assertIn("Adequate targeted evidence is sufficient", materiality)

    def test_requirement_authority_cannot_be_laundered_by_workflow_artifacts(self) -> None:
        materiality = read("protocols/MATERIALITY_GATE.md")

        self.assertIn("Workflow artifacts are derivative contracts", materiality)
        self.assertIn("restating an item downstream does not increase its authority", materiality)
        self.assertIn("Only the first three may seed a blocking acceptance criterion", materiality)
        self.assertIn("workflow_suggested", materiality)
        self.assertIn("its absence alone cannot block completion", materiality)
        self.assertIn("existed before the current", materiality)
        self.assertIn("created earlier in the same workflow", materiality)
        self.assertIn("record that approval as", materiality)

        for relative_path in (
            "agents/specifier.md",
            "agents/planner.md",
            "agents/atomizer.md",
            "agents/flow-splitter.md",
            "agents/reviewer.md",
        ):
            text = read(relative_path)
            with self.subTest(relative_path=relative_path):
                self.assertRegex(text.lower(), r"derivative|merely by (being )?restated")

    def test_validation_infrastructure_requires_prior_authority(self) -> None:
        materiality = read("protocols/MATERIALITY_GATE.md")

        self.assertIn("Product tests and fixtures", materiality)
        self.assertIn("The orchestrator must", materiality)
        self.assertIn("record that authorization before dispatch", materiality)
        self.assertIn("cannot self-authorize it", materiality)
        self.assertIn("Legacy 1.0 artifacts remain valid", materiality)
        self.assertIn('`{ "authorized": false }`', materiality)

        for relative_path in (
            "agents/executor.md",
            "agents/generalist.md",
            "agents/reviewer.md",
            "agents/atomizer.md",
            "agents/flow-splitter.md",
            "agents/orchestrator-simple.md",
            "agents/orchestrator-flow.md",
            "agents/orchestrator-pipeline.md",
            "agents/orchestrator-general.md",
            "agents/orchestrator-modernize.md",
            "skills/run-adaptive/SKILL.md",
        ):
            text = read(relative_path)
            with self.subTest(relative_path=relative_path):
                self.assertIn("validation infrastructure", text.lower())

    def test_legacy_handoffs_and_ci_generation_have_explicit_admission_rules(self) -> None:
        pipeline = read("agents/orchestrator-pipeline.md")
        executor = read("agents/executor.md")
        reviewer = read("agents/reviewer.md")
        ci = read("agents/orchestrator-ci.md")

        for target, text in (
            ("pipeline", pipeline),
            ("executor", executor),
            ("reviewer", reviewer),
        ):
            with self.subTest(target=target):
                self.assertIn("legacy 1.0", text.lower())
                self.assertIn("pre-workflow repository evidence", text)
                self.assertRegex(
                    text,
                    r"`validation_infrastructure\.authorized` as false when omitted|"
                    r"omitted `validation_infrastructure`|missing the field|normalized false",
                )

        self.assertIn('"authorized": true', ci)
        self.assertIn('"source": "explicit_user"', ci)
        self.assertIn('"source_ref": "current_invocation:--generate"', ci)

    def test_source_aware_schema_contracts_remain_backward_compatible(self) -> None:
        problem_schema = read("protocols/schemas/problem-spec.schema.json")
        dev_schema = read("protocols/schemas/dev-spec.schema.json")
        task_schema = read("protocols/schemas/task-list.schema.json")
        flow_schema = read("protocols/schemas/flow-task-list.schema.json")

        self.assertIn('"const": "1.1"', problem_schema)
        self.assertIn('"explicit_user"', problem_schema)
        self.assertIn('"const": "1.1"', dev_schema)
        self.assertIn('"workflow_suggested"', dev_schema)
        self.assertIn('"infrastructure_change"', dev_schema)
        self.assertIn('"validation_infrastructure"', task_schema)
        self.assertIn('"validation_infrastructure"', flow_schema)

        legacy = read("protocols/examples/task-list.trace.valid.json")
        self.assertIn('"protocol_version": "1.0"', legacy)

    def test_workflows_admit_review_findings_instead_of_obeying_them(self) -> None:
        for relative_path in (
            "agents/orchestrator-simple.md",
            "agents/orchestrator-flow.md",
            "agents/orchestrator-pipeline.md",
            "skills/run-adaptive/SKILL.md",
        ):
            text = read(relative_path)
            with self.subTest(relative_path=relative_path):
                self.assertIn("not automatic authorization to edit", text)
                self.assertIn("smallest necessary fix", text)
                self.assertRegex(
                    text.lower(),
                    r"appl(?:y|ying) `protocols/materiality_gate\.md` to each finding",
                )

    def test_exporters_preserve_materiality_admission_when_compacting(self) -> None:
        for relative_path in (
            "scripts/export-codex-agents.py",
            "scripts/export-claude-agents.py",
            "scripts/export-copilot-agents.py",
        ):
            text = read(relative_path)
            with self.subTest(relative_path=relative_path):
                self.assertIn("adequate targeted evidence is sufficient", text)
                self.assertIn("not automatic edit authorization", text)
                self.assertIn("derivative DoD or test-plan wording cannot add authority", text)
                self.assertIn("workflow-suggested checks do not block by absence", text)
                self.assertNotIn("reviewer decisions are final", text)


if __name__ == "__main__":
    unittest.main()
