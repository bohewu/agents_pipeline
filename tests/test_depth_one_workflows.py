import json
import unittest
from pathlib import Path

from jsonschema import Draft7Validator


REPO_ROOT = Path(__file__).resolve().parents[1]


class DepthOneWorkflowContractTest(unittest.TestCase):
    def test_every_formal_skill_adopts_its_primary_workflow_in_main_agent(self) -> None:
        modes = json.loads((REPO_ROOT / "modes.json").read_text(encoding="utf-8"))[
            "modes"
        ]

        for mode in modes:
            with self.subTest(mode=mode["name"]):
                skill = REPO_ROOT / "skills" / f"run-{mode['name']}" / "SKILL.md"
                body = skill.read_text(encoding="utf-8")
                self.assertIn("current/main agent", body)
                self.assertIn("do not spawn", body.lower())

    def test_modernize_transitions_to_pipeline_without_primary_agent_nesting(self) -> None:
        modernize = (REPO_ROOT / "agents/orchestrator-modernize.md").read_text(
            encoding="utf-8"
        )
        pipeline = (REPO_ROOT / "agents/orchestrator-pipeline.md").read_text(
            encoding="utf-8"
        )

        self.assertNotIn("@orchestrator-pipeline", modernize)
        self.assertNotIn("@orchestrator-modernize", pipeline)
        self.assertIn("adopt that Pipeline definition in place", modernize)
        self.assertIn("exported worker roles are leaf agents", modernize)
        self.assertIn("MUST NOT spawn a second primary orchestrator", pipeline)

    def test_current_codex_docs_do_not_require_depth_two(self) -> None:
        current_docs = [
            REPO_ROOT / "README.md",
            REPO_ROOT / "COMPATIBILITY.md",
            REPO_ROOT / "docs/codex-mapping.md",
            REPO_ROOT / "docs/developer-install.md",
            REPO_ROOT / "docs/runtime-agent-model-profiles.md",
        ]
        forbidden = (
            "max_depth >= 2",
            "max_depth` of at least `2",
            "max_depth = 2",
            "depth `2`",
        )

        for path in current_docs:
            body = path.read_text(encoding="utf-8")
            with self.subTest(path=path.relative_to(REPO_ROOT)):
                for phrase in forbidden:
                    self.assertNotIn(phrase, body)

    def test_transition_schema_accepts_legacy_saved_contract_without_nesting(self) -> None:
        schema = json.loads(
            (
                REPO_ROOT
                / "protocols/schemas/modernize-exec-handoff.schema.json"
            ).read_text(encoding="utf-8")
        )
        payload = json.loads(
            (
                REPO_ROOT
                / "protocols/examples/modernize-exec-handoff.valid.json"
            ).read_text(encoding="utf-8")
        )
        payload["protocol_version"] = "1.0"
        payload["recipient_agent"] = "@orchestrator-pipeline"
        del payload["target_workflow"]

        self.assertEqual(list(Draft7Validator(schema).iter_errors(payload)), [])
        self.assertIn(
            "does not authorize spawning another primary orchestrator",
            schema["properties"]["recipient_agent"]["description"],
        )


if __name__ == "__main__":
    unittest.main()
