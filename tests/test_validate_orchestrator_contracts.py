import importlib.util
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "validate-orchestrator-contracts.py"
)
SPEC = importlib.util.spec_from_file_location(
    "validate_orchestrator_contracts", SCRIPT_PATH
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ValidateOrchestratorContractsTest(unittest.TestCase):
    def make_repo(self) -> Path:
        root = Path(self.temp_dir.name)
        (root / "opencode" / "agents").mkdir(parents=True)
        (root / "opencode" / "commands").mkdir(parents=True)
        (root / "opencode" / "plugins" / "status-runtime").mkdir(parents=True)
        (root / "opencode" / "protocols" / "schemas").mkdir(parents=True)

        self.write(
            root / "AGENTS.md",
            """
            # Agent Catalog

            | Agent | Role | Mode | Notes |
            |------|------|------|-------|
            | orchestrator-general | General-purpose orchestration | primary | Test fixture |
            """,
        )
        self.write(
            root / "opencode" / "agents" / "orchestrator-general.md",
            """
            ---
            name: orchestrator-general
            mode: primary
            ---

            # Orchestrator General
            """,
        )
        self.write(
            root / "opencode" / "commands" / "run-general.md",
            """
            ---
            description: Run general workflow
            agent: orchestrator-general
            ---

            # Run General
            """,
        )
        self.write(
            root / "opencode" / "commands" / "run-monetize.md",
            """
            ---
            description: Run monetization workflow
            agent: orchestrator-general
            ---

            # Run Monetize
            """,
        )
        self.write(
            root / "opencode" / "plugins" / "status-runtime" / "constants.js",
            'const ORCHESTRATORS = ["orchestrator-general"];',
        )
        self.write_schema(
            root / "opencode" / "protocols" / "schemas" / "run-status.schema.json"
        )
        self.write_schema(
            root / "opencode" / "protocols" / "schemas" / "checkpoint.schema.json"
        )
        return root

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = self.make_repo()
        self.patchers = [
            mock.patch.object(MODULE, "REPO_ROOT", self.repo_root),
            mock.patch.object(MODULE, "AGENTS_DIR", self.repo_root / "opencode" / "agents"),
            mock.patch.object(MODULE, "COMMANDS_DIR", self.repo_root / "opencode" / "commands"),
        ]
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self) -> None:
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temp_dir.cleanup()

    def write(self, path: Path, content: str) -> None:
        path.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8")

    def write_schema(self, path: Path) -> None:
        self.write(
            path,
            """
            {
              "properties": {
                "orchestrator": {
                  "enum": ["orchestrator-general"]
                }
              }
            }
            """,
        )

    def test_main_passes_for_valid_projection(self) -> None:
        self.assertEqual(MODULE.main(), 0)

    def test_main_rejects_agent_missing_from_catalog(self) -> None:
        self.write(
            self.repo_root / "opencode" / "agents" / "tmp-validator-agent.md",
            """
            ---
            name: tmp-validator-agent
            mode: subagent
            ---

            # Temporary Agent
            """,
        )

        with self.assertRaisesRegex(
            ValueError,
            r"AGENTS\.md full agent table is out of sync with expected members: unexpected=\['tmp-validator-agent'\]",
        ):
            MODULE.main()

    def test_main_rejects_unknown_command_agent(self) -> None:
        self.write(
            self.repo_root / "opencode" / "commands" / "tmp-invalid-agent.md",
            """
            ---
            description: Temporary invalid command
            agent: not-a-real-agent
            ---

            # Temporary Invalid Command
            """,
        )

        with self.assertRaisesRegex(
            ValueError,
            r"command frontmatter references unknown agents: tmp-invalid-agent:not-a-real-agent",
        ):
            MODULE.main()

    def test_main_rejects_unallowlisted_run_alias(self) -> None:
        self.write(
            self.repo_root / "opencode" / "commands" / "run-tmp-alias.md",
            """
            ---
            description: Temporary alias command
            agent: orchestrator-general
            ---

            # Temporary Run Alias
            """,
        )

        with self.assertRaisesRegex(
            ValueError,
            r"run-command mappings are out of sync: run-tmp-alias has no matching primary orchestrator and no allowlisted alias \(found orchestrator-general\)",
        ):
            MODULE.main()


if __name__ == "__main__":
    unittest.main()
