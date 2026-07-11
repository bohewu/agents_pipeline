import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "path_safety.py"


def load_module():
    spec = importlib.util.spec_from_file_location("path_safety_under_test", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


MODULE = load_module()


class GeneratedShellPathSafetyTest(unittest.TestCase):
    def test_linklike_detects_junction_and_reparse_protocols(self) -> None:
        junction = mock.Mock()
        junction.is_symlink.return_value = False
        junction.is_junction.return_value = True
        self.assertTrue(MODULE.is_linklike(junction))

        reparse = mock.Mock(spec=["is_symlink", "lstat"])
        reparse.is_symlink.return_value = False
        reparse.lstat.return_value = SimpleNamespace(st_file_attributes=0x400)
        self.assertTrue(MODULE.is_linklike(reparse))

    def test_accepts_common_cross_platform_path_characters(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "O'Brien (Work); R&D" / "agents pipeline"
            normalized = MODULE.validate_generated_shell_path(path, "Target path")
            self.assertEqual(normalized, path.resolve(strict=False).as_posix())

    def test_rejects_double_quote_interpolation_and_control_characters(self) -> None:
        unsafe_characters = ["$", "`", '"', "\n", "\r", "\t", "\x7f"]
        if os.name != "nt":
            # A backslash is a literal filename character only on POSIX. On
            # Windows it is a normal separator and normalizes to ``/``.
            unsafe_characters.append("\\")
        with tempfile.TemporaryDirectory() as temp_dir:
            for character in unsafe_characters:
                with self.subTest(character=repr(character)):
                    path = f"{temp_dir}/unsafe{character}component"
                    with self.assertRaisesRegex(
                        ValueError,
                        "unsafe in generated shell instructions",
                    ):
                        MODULE.validate_generated_shell_path(path, "Target path")


if __name__ == "__main__":
    unittest.main()
