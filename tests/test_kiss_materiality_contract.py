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
                self.assertNotIn("reviewer decisions are final", text)


if __name__ == "__main__":
    unittest.main()
