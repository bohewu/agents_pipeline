# Spec -> Pipeline Handoff

This SOP explains how to take approved `/run-spec` outputs and use them as inputs for `/run-pipeline` implementation.

## Expected Spec Artifacts

Store these under the pipeline output root:

- `.pipeline-output/spec/problem-spec.json`
- `.pipeline-output/spec/dev-spec.json`
- `.pipeline-output/spec/dev-spec.md`
- `.pipeline-output/spec/plan-outline.json`

If you used `--output-dir=<path>`, replace `.pipeline-output/` with that path.

## What Each Artifact Is For

- `problem-spec.json` -> minimum scope boundary for implementation
- `dev-spec.json` -> primary behavior, scenario, acceptance, and test-trace contract
- `dev-spec.md` -> human review copy; useful context, but not the canonical machine contract
- `plan-outline.json` -> optional planning accelerator; must not expand scope beyond the approved spec

## How `/run-pipeline` Should Use Them

- Treat `problem-spec.json` as the scope boundary.
- Treat `dev-spec.json` as the richer behavior contract.
- Prefer task decomposition that preserves `trace_ids` back to `story-*`, `sc-*`, `ac-*`, and `tc-*` ids from `dev-spec.json`.
- Use `plan-outline.json` only to speed up planning; if it conflicts with the spec, the spec wins.
- Use `dev-spec.md` as a human-readable review aid, not as the source of truth when JSON artifacts are available.

## Recommended Handoff Note

When invoking `/run-pipeline`, include a short note like this in the main prompt:

- "Use `.pipeline-output/spec/problem-spec.json` as the scope boundary and `.pipeline-output/spec/dev-spec.json` as the behavior and traceability contract."

## Concrete Invocation Examples

Use one of these patterns:

```text
/run-pipeline Implement the approved workspace invite spec. Use .pipeline-output/spec/problem-spec.json as the scope boundary and .pipeline-output/spec/dev-spec.json as the behavior and traceability contract.
```

```text
/run-pipeline Implement the reviewed checkout retry flow. Use .pipeline-output/spec/problem-spec.json and .pipeline-output/spec/dev-spec.json as approved inputs. Preserve task trace_ids back to the spec. --confirm
```

```text
/run-pipeline Implement the approved OAuth login spec. Use .pipeline-output/spec/problem-spec.json for scope, .pipeline-output/spec/dev-spec.json for scenarios and acceptance criteria, and .pipeline-output/spec/plan-outline.json as planning context. --effort=balanced
```

## End-To-End Reference Example

For a concrete artifact set that starts at `/run-spec` outputs and ends at `task-list.json`, see:

- `opencode/protocols/SPEC_E2E_EXAMPLE.md`
- `opencode/protocols/examples/spec-to-pipeline/problem-spec.json`
- `opencode/protocols/examples/spec-to-pipeline/dev-spec.json`
- `opencode/protocols/examples/spec-to-pipeline/dev-spec.md`
- `opencode/protocols/examples/spec-to-pipeline/plan-outline.json`
- `opencode/protocols/examples/spec-to-pipeline/task-list.json`

## Reviewer Expectations

When spec artifacts are part of the handoff:

- reviewer should check alignment with `ProblemSpec` and `DevSpec`
- task outputs should remain traceable through `trace_ids`
- missing required `DevSpec` coverage should fail review

## If Spec Artifacts Are Missing Or Outdated

- If the approved spec does not exist yet, run `/run-spec` first.
- If the spec exists but has changed materially since approval, re-run `/run-spec` before implementation.
- If only the Markdown copy exists, prefer regenerating the JSON contracts instead of implementing from prose alone.

## Practical Rule

- Review in `dev-spec.md`
- Implement from `problem-spec.json` + `dev-spec.json`
- Verify using task `trace_ids` and reviewer alignment
