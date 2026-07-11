import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = REPO_ROOT / "tools" / "validate-schema.py"


@unittest.skipUnless(importlib.util.find_spec("jsonschema"), "jsonschema is not installed")
class ValidateSchemaFormatTest(unittest.TestCase):
    def test_require_jsonschema_enforces_date_time_format(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            root = Path(temp_dir_name)
            schema = root / "schema.json"
            payload = root / "payload.json"
            schema.write_text(
                json.dumps(
                    {
                        "$schema": "https://json-schema.org/draft/2020-12/schema",
                        "type": "object",
                        "required": ["timestamp"],
                        "properties": {
                            "timestamp": {"type": "string", "format": "date-time"}
                        },
                    }
                ),
                encoding="utf-8",
            )
            payload.write_text(
                json.dumps({"timestamp": "January 1, 2026"}),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    VALIDATOR.as_posix(),
                    "--schema",
                    schema.as_posix(),
                    "--input",
                    payload.as_posix(),
                    "--require-jsonschema",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 1)
            self.assertIn("not a 'date-time'", result.stderr)


if __name__ == "__main__":
    unittest.main()
