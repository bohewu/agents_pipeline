"""Codex 0.156.1 project-layer proof for linked Git worktrees."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "codex_project_profile", ROOT / "scripts/codex-project-profile.py"
)
assert SPEC and SPEC.loader
PROFILE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROFILE)


@unittest.skipUnless(shutil.which("codex") and shutil.which("git"), "Codex and Git required")
class LinkedWorktreeTrustTests(unittest.TestCase):
    def git(self, root: Path, *args: str) -> None:
        subprocess.run(
            ["git", "-C", str(root), *args], check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=10,
        )

    def checkout(self, root: Path) -> Path:
        root.mkdir()
        self.git(root, "init")
        (root / "tracked.txt").write_text("fixture\n", encoding="utf-8")
        self.git(root, "add", "tracked.txt")
        self.git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                 "commit", "-m", "fixture")
        return root

    def trust_config(self, home: Path, entries: dict[Path, str]) -> str:
        content = "".join(
            f"[projects.{json.dumps(str(path.resolve()))}]\ntrust_level = {json.dumps(level)}\n"
            for path, level in entries.items()
        )
        (home / "config.toml").write_text(content, encoding="utf-8")
        return content

    def assert_trust(self, home: Path, workspace: Path, trust: str) -> None:
        result = PROFILE._eligibility_metadata(home, workspace, configured=True)
        self.assertEqual(result["project_trust"], trust)
        self.assertEqual(result["profile_eligibility"],
                         "eligible" if trust == "trusted" else "ineligible")

    def test_codex_project_layer_proves_only_its_own_linked_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            home = root / "codex-home"
            home.mkdir()
            source = self.checkout(root / "source")
            worktree = root / "worktree"
            self.git(source, "worktree", "add", "--detach", str(worktree))
            local_config = worktree / ".codex" / "config.toml"
            local_config.parent.mkdir()
            local_config.write_text('model_reasoning_effort = "high"\n', encoding="utf-8")

            trusted_config = self.trust_config(home, {source: "trusted"})
            self.assert_trust(home, source, "trusted")
            self.assert_trust(home, worktree, "trusted")
            self.assertEqual((home / "config.toml").read_text(encoding="utf-8"), trusted_config)
            with patch.object(PROFILE.shutil, "which", return_value=None):
                self.assert_trust(home, worktree, "unknown")

            self.trust_config(home, {})
            self.assert_trust(home, source, "unknown")
            self.assert_trust(home, worktree, "unknown")
            self.trust_config(home, {source: "untrusted"})
            self.assert_trust(home, worktree, "unknown")
            self.trust_config(home, {source: "trusted", worktree: "untrusted"})
            self.assert_trust(home, worktree, "untrusted")

            self.trust_config(home, {source: "trusted"})
            unrelated = self.checkout(root / "unrelated")
            unrelated_worktree = root / "unrelated-worktree"
            self.git(unrelated, "worktree", "add", "--detach", str(unrelated_worktree))
            (unrelated_worktree / ".codex").mkdir()
            (unrelated_worktree / ".codex/config.toml").write_text(
                'model_reasoning_effort = "high"\n', encoding="utf-8"
            )
            self.assert_trust(home, unrelated_worktree, "unknown")

            submodule_source = self.checkout(root / "submodule-source")
            self.git(source, "-c", "protocol.file.allow=always", "submodule", "add",
                     str(submodule_source), "nested-module")
            submodule = source / "nested-module"
            (submodule / ".codex").mkdir()
            (submodule / ".codex/config.toml").write_text(
                'model_reasoning_effort = "high"\n', encoding="utf-8"
            )
            self.assert_trust(home, submodule, "unknown")

            forged = root / "forged"
            forged.mkdir()
            (forged / ".codex").mkdir()
            (forged / ".codex/config.toml").write_text(
                'model_reasoning_effort = "high"\n', encoding="utf-8"
            )
            (forged / ".git").write_bytes((worktree / ".git").read_bytes())
            self.assert_trust(home, forged, "unknown")

            admin = Path(subprocess.check_output(
                ["git", "-C", str(worktree), "rev-parse", "--absolute-git-dir"], text=True
            ).strip())
            commondir = admin / "commondir"
            original = commondir.read_bytes()
            try:
                commondir.write_text(str(unrelated / ".git") + "\n", encoding="utf-8")
                self.assert_trust(home, worktree, "unknown")
            finally:
                commondir.write_bytes(original)

            local_config.unlink()
            local_config.parent.rmdir()
            (source / ".codex").mkdir()
            (source / ".codex/config.toml").write_text(
                'model_reasoning_effort = "low"\n', encoding="utf-8"
            )
            self.assert_trust(home, worktree, "unknown")
            self.assert_trust(home, source, "trusted")

            if os.name != "nt":
                (forged / ".git").unlink()
                (forged / ".git").symlink_to(worktree / ".git")
                self.assert_trust(home, forged, "unknown")


if __name__ == "__main__":
    unittest.main()
