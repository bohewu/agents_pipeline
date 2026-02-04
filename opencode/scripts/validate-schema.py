#!/usr/bin/env python
import argparse
import json
import os
import re
import sys


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def type_ok(expected, value):
    if expected == "string":
        return isinstance(value, str)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    return True


def validate(schema, data, path="$"):
    errors = []

    expected_type = schema.get("type")
    if expected_type and not type_ok(expected_type, data):
        errors.append(f"{path}: expected {expected_type}")
        return errors

    enum = schema.get("enum")
    if enum is not None and data not in enum:
        errors.append(f"{path}: value {data!r} not in enum {enum!r}")
        return errors

    if expected_type == "string":
        min_length = schema.get("minLength")
        if min_length is not None and isinstance(data, str) and len(data) < min_length:
            errors.append(f"{path}: minLength {min_length} not met")
        pattern = schema.get("pattern")
        if pattern and isinstance(data, str):
            if re.fullmatch(pattern, data) is None:
                errors.append(f"{path}: pattern {pattern!r} not matched")

    if expected_type == "array":
        min_items = schema.get("minItems")
        if min_items is not None and isinstance(data, list) and len(data) < min_items:
            errors.append(f"{path}: minItems {min_items} not met")
        items_schema = schema.get("items")
        if items_schema is not None and isinstance(data, list):
            for idx, item in enumerate(data):
                errors.extend(validate(items_schema, item, f"{path}[{idx}]"))

    if expected_type == "object":
        required = schema.get("required", [])
        if isinstance(data, dict):
            for key in required:
                if key not in data:
                    errors.append(f"{path}: missing required property {key!r}")
            properties = schema.get("properties", {})
            for key, value in data.items():
                if key in properties:
                    errors.extend(validate(properties[key], value, f"{path}.{key}"))
            if schema.get("additionalProperties") is False and properties:
                extras = [k for k in data.keys() if k not in properties]
                if extras:
                    errors.append(f"{path}: additional properties not allowed: {extras!r}")

    return errors


def main():
    parser = argparse.ArgumentParser(description="Validate JSON against a schema.")
    parser.add_argument("--schema", required=True, help="Path to JSON schema file.")
    parser.add_argument("--input", required=True, help="Path to JSON input file.")
    args = parser.parse_args()

    schema_path = os.path.expanduser(args.schema)
    input_path = os.path.expanduser(args.input)

    try:
        schema = load_json(schema_path)
        data = load_json(input_path)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Failed to load JSON: {exc}", file=sys.stderr)
        return 2

    try:
        import jsonschema  # type: ignore
    except Exception:
        jsonschema = None

    if jsonschema is not None:
        try:
            jsonschema.validate(instance=data, schema=schema)
            print("OK: schema validation passed")
            return 0
        except Exception as exc:  # pragma: no cover
            print(f"FAIL: schema validation failed: {exc}", file=sys.stderr)
            return 1

    errors = validate(schema, data)
    if errors:
        print("FAIL: validation failed")
        for err in errors:
            print(f"- {err}")
        print("Tip: install jsonschema for full validation: python -m pip install jsonschema")
        return 1

    print("OK: basic validation passed (jsonschema not installed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
