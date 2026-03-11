# Modernize Target Bootstrap Example

This example shows how to move from modernization planning in the source project to implementation in the target project when the target may not exist yet.

## Scenario A: Target Already Exists

Start in the source project:

```text
/run-modernize Modernize legacy .NET monolith --mode=plan+handoff --target=../my-app-v2
```

Review the generated docs under:

- `.pipeline-output/modernize/modernize-index.md`
- `.pipeline-output/modernize/phase-P1.handoff.json`

Then switch to the target project and continue implementation:

```text
/run-pipeline Implement modernization roadmap phase P1 in target project B. Use ../source-repo/.pipeline-output/modernize/phase-P1.handoff.json as the execution contract.
```

## Scenario B: Target Does Not Exist, One-Shot Bootstrap

Start in the source project:

```text
/run-modernize Modernize legacy .NET monolith --mode=phase-exec --execute-phase=P1 --target=../my-app-v2 --init-target --pipeline-flag=--effort=balanced
```

Expected behavior:

1. Source project writes modernization docs to `.pipeline-output/modernize/`
2. Target directory `../my-app-v2` is created if missing
3. Target bootstrap docs are prepared with `orchestrator-init`
4. Execution handoff continues into the target project

Target-side ownership after bootstrap:

- `.pipeline-output/init/` -> target bootstrap docs
- `.pipeline-output/pipeline/` -> implementation, tests, checkpoints, review outputs

## Scenario C: Target Does Not Exist, Manual Path

Start in the source project:

```text
/run-modernize Modernize legacy .NET monolith --mode=phase-exec --execute-phase=P1 --target=../my-app-v2
```

Expected outcome:

- The flow stops before execution handoff
- It tells you to either create the target manually or rerun with `--init-target`

Manual path:

```text
mkdir ../my-app-v2
```

Then open a session in the target project and continue:

```text
/run-pipeline Implement modernization roadmap phase P1 in target project B. Use ../source-repo/.pipeline-output/modernize/phase-P1.handoff.json as the execution contract.
```

## What Should Appear In `modernize-index.md`

The `Next Steps` section should contain copyable commands, not just prose. Good examples:

```text
From the target project, run:
/run-pipeline Continue the approved modernization execution. Use ../source-repo/.pipeline-output/modernize/latest-handoff.json as the execution contract.
```

```text
If the target project does not exist yet, rerun:
/run-modernize Modernize legacy .NET monolith --mode=phase-exec --execute-phase=P1 --target=../my-app-v2 --init-target
```

## Practical Rule

- Plan from the source project
- Bootstrap and implement in the target project
- Keep handoff files under the source project's `.pipeline-output/modernize/` unless you intentionally copy them into the target project
