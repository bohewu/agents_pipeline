import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "validate-helper-contracts.py"
SPEC = importlib.util.spec_from_file_location("validate_helper_contracts", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ValidateHelperContractsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def fixture_text(self, relative_path: str) -> str:
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def write_temp(self, name: str, content: str) -> Path:
        path = self.temp_root / name
        path.write_text(content, encoding="utf-8")
        return path

    def run_validator(self, *, ledger: Path, kanban: Path, session_guide: Path) -> int:
        return MODULE.main(
            [
                "--ledger",
                str(ledger),
                "--kanban",
                str(kanban),
                "--session-guide",
                str(session_guide),
                "--session-guide-template",
                str(REPO_ROOT / "session-guide.example.md"),
            ]
        )

    def test_main_passes_for_checked_in_fixtures(self) -> None:
        self.assertEqual(MODULE.main([]), 0)

    def test_main_rejects_missing_kanban_item(self) -> None:
        ledger = self.write_temp(
            "todo-ledger.example.json", self.fixture_text("todo-ledger.example.json")
        )
        kanban = self.write_temp(
            "kanban.example.md",
            self.fixture_text("kanban.example.md").replace(
                "- `kb-001` Follow up on reviewer required items from the last run.",
                "- None",
            ),
        )
        session_guide = self.write_temp(
            "session-guide.example.md", self.fixture_text("session-guide.example.md")
        )

        with self.assertRaisesRegex(ValueError, r"missing ids=\['kb-001'\]"):
            self.run_validator(ledger=ledger, kanban=kanban, session_guide=session_guide)

    def test_main_rejects_wrong_kanban_status_mapping(self) -> None:
        ledger = self.write_temp(
            "todo-ledger.example.json", self.fixture_text("todo-ledger.example.json")
        )
        kanban = self.write_temp(
            "kanban.example.md",
            self.fixture_text("kanban.example.md").replace(
                "## Ready\n\n- `kb-001` Follow up on reviewer required items from the last run.\n\n## Doing\n\n- None",
                "## Ready\n\n- None\n\n## Doing\n\n- `kb-001` Follow up on reviewer required items from the last run.",
            ),
        )
        session_guide = self.write_temp(
            "session-guide.example.md", self.fixture_text("session-guide.example.md")
        )

        with self.assertRaisesRegex(ValueError, r"wrong sections="):
            self.run_validator(ledger=ledger, kanban=kanban, session_guide=session_guide)

    def test_main_rejects_session_guide_section_drift(self) -> None:
        ledger = self.write_temp(
            "todo-ledger.example.json", self.fixture_text("todo-ledger.example.json")
        )
        kanban = self.write_temp("kanban.example.md", self.fixture_text("kanban.example.md"))
        session_guide = self.write_temp(
            "session-guide.example.md",
            self.fixture_text("session-guide.example.md").replace(
                "## Common Commands\n\n- Commands that are regularly useful for validation, exports, or local development.\n\n## Known Long-Lived Risks",
                "## Current Run Status\n\n- Blocked on a temporary dependency review.\n\n## Common Commands\n\n- Commands that are regularly useful for validation, exports, or local development.\n\n## Known Long-Lived Risks",
            ),
        )

        with self.assertRaisesRegex(
            ValueError, r"top-level sections do not match template .*unexpected=\['Current Run Status'\]"
        ):
            self.run_validator(ledger=ledger, kanban=kanban, session_guide=session_guide)

    def test_main_rejects_ephemeral_session_guide_content(self) -> None:
        ledger = self.write_temp(
            "todo-ledger.example.json", self.fixture_text("todo-ledger.example.json")
        )
        kanban = self.write_temp("kanban.example.md", self.fixture_text("kanban.example.md"))
        session_guide = self.write_temp(
            "session-guide.example.md",
            self.fixture_text("session-guide.example.md").replace(
                "- Commands that are regularly useful for validation, exports, or local development.",
                "- Commands that are regularly useful for validation, exports, or local development.\n- Current run status: blocked until a temporary blocker is resolved.",
            ),
        )

        with self.assertRaisesRegex(ValueError, r"contains ephemeral content \(run status/progress\)"):
            self.run_validator(ledger=ledger, kanban=kanban, session_guide=session_guide)


if __name__ == "__main__":
    unittest.main()
