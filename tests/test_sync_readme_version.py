import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts/sync-readme-version.py"
SPEC = importlib.util.spec_from_file_location("sync_readme_version", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SyncReadmeVersionTest(unittest.TestCase):
    def fixture(self, current: str = "v1.2.3") -> str:
        return (
            "# README\n"
            "<!-- BEGIN current-release -->\n"
            f"install {current}; VERSION=1.2.3\n"
            "<!-- END current-release -->\n"
            "outside v0.26.1\n"
            "<!-- BEGIN legacy-opencode-v0.26.1 -->\n"
            "legacy v0.26.1\n"
            "<!-- END legacy-opencode-v0.26.1 -->\n"
        )

    def test_sync_updates_only_current_release_block(self) -> None:
        original = self.fixture()
        updated, count = MODULE.sync_readme_text(original, "9.8.7")
        self.assertEqual(count, 2)
        self.assertIn("install v9.8.7; VERSION=9.8.7", updated)
        self.assertIn("outside v0.26.1", updated)
        self.assertIn("legacy v0.26.1", updated)

    def test_sync_requires_marker_pairs(self) -> None:
        with self.assertRaisesRegex(MODULE.ReadmeVersionSyncError, "current-release"):
            MODULE.sync_readme_text(
                "<!-- BEGIN legacy-opencode-v0.26.1 -->\nlegacy\n<!-- END legacy-opencode-v0.26.1 -->\n",
                "1.0.0",
            )

    def test_sync_requires_a_managed_tag(self) -> None:
        with self.assertRaisesRegex(MODULE.ReadmeVersionSyncError, "no managed"):
            MODULE.sync_readme_text(self.fixture(current="release-current"), "1.0.0")


if __name__ == "__main__":
    unittest.main()
