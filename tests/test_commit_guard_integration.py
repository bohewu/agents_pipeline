"""Focused integration checks for the Commit Guard support-tree contract."""

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(
        "commit_guard_test_" + name.replace("-", "_"), ROOT / "scripts" / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class CommitGuardIntegrationTest(unittest.TestCase):
    def test_runtime_exporters_quote_guard_command_paths_with_spaces(self):
        command = "node tools/commit-guard.js check --staged"
        support = "/opt/fixture support"
        expected = f'node "{support}/tools/commit-guard.js" check --staged'
        for name in ("export-codex-agents", "export-claude-agents", "export-copilot-agents"):
            with self.subTest(runtime=name):
                module = load_script(name)
                self.assertEqual(module.rewrite_neutral_refs(command, support), expected)
        sync = load_script("sync-runtime-support")
        self.assertEqual(sync.rewrite_support_refs(command, Path(support)), expected)

    def test_support_sync_distributes_guard_without_installing_real_hooks(self):
        sync = load_script("sync-runtime-support")
        with tempfile.TemporaryDirectory(prefix="commit-guard-support-") as temp:
            target = Path(temp) / "support with spaces"
            sync.sync_support_tree(ROOT, target, dry_run=False)
            self.assertTrue((target / "tools/commit-guard.js").is_file())
            self.assertTrue((target / "tools/commit-guard/check.js").is_file())
            for source in (ROOT / "tools/commit-guard").glob("*.js"):
                self.assertEqual(source.read_bytes(), (target / "tools/commit-guard" / source.name).read_bytes())
            protocol = (target / "protocols/COMMIT_GUARD.md").read_text(encoding="utf-8")
            self.assertIn(f'node "{target.as_posix()}/tools/commit-guard.js"', protocol)
            self.assertNotIn("node tools/commit-guard.js", protocol)
            self.assertFalse((target / ".git").exists())

    def test_commit_capable_sources_reference_shared_protocol(self):
        for name in ("AGENTS.md", "agents/executor.md", "agents/peon.md", "agents/generalist.md"):
            self.assertIn("protocols/COMMIT_GUARD.md", (ROOT / name).read_text(encoding="utf-8"))
        self.assertIn("agents/executor.md", (ROOT / "agents/executor-strong.md").read_text(encoding="utf-8"))
        installer = load_script("install-codex-config")
        support = "/opt/fixture support"
        for builder in (installer.build_global_agents_managed_block, installer.build_workspace_agents_managed_block):
            with self.subTest(builder=builder.__name__):
                managed = builder(ROOT / "modes.json", support)
                self.assertIn(f"{support}/protocols/COMMIT_GUARD.md", managed)

    def test_consumer_workflow_separates_trusted_scanner_from_candidate_policy(self):
        workflow = (ROOT / ".github/workflows/commit-guard.yml").read_text(encoding="utf-8")
        self.assertIn("workflow_call:", workflow)
        self.assertNotIn("pull_request_target", workflow)
        self.assertIn("path: candidate", workflow)
        self.assertIn("path: trusted-guard", workflow)
        self.assertIn("ref: ${{ inputs.tool_sha }}", workflow)
        self.assertEqual(workflow.count("persist-credentials: false"), 2)
        self.assertIn("--policy-source cli", workflow)
        self.assertIn("--engine builtin", workflow)
        self.assertIn("fetch-depth: 0", workflow)
        self.assertNotIn("github.workflow_sha", workflow)


if __name__ == "__main__":
    unittest.main()
