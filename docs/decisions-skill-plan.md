# Proposed `$decide` skill and credential lifecycle

Date: 2026-10-30. Repository baseline: v0.45.0 (`140548a`).
Status: design and implementation independently reviewed PASS, with no material followups. Source skill, local setup/launcher and mocked API implementation are complete. One authorized Linux live request successfully returned all three answer types with `gpt-6-luna` (381 input tokens, zero output tokens). This proves that request's access, not organization attribution or remaining credits. Windows execution is not qualified locally. No installed tools were updated.

## Request and scope

The user requested a manually invocable Decisions API capability, a plan for API-token storage/rotation and possible OAuth, followed by independent Reviewer review. This authorizes this design document and review, not API calls, key creation/reuse, installation, commit/push, or release.

Subsequent authorization: the user requested a new dedicated key and implementation, then chose to enter a manually created key locally while scripts are implemented first. The hosted selection is complete but local destination confirmation returned `not_approved`; no key-creation API call or credential write occurred through that flow. Implementation now includes an explicit interactive setup/launcher (`scripts/decide.py`) for the operator to run, with mocked API tests only. This does not authorize automated secret entry, installation, commit/push or release.

Delivery authorization: after manually configuring the credential, the user requested a live test, independent Reviewer review, then commit and push if successful. Installation, Yetlet changes, global tool updates, Git-hook changes and release remain outside scope. The live test used synthetic text only and made one request without retries.

Proposed first delivery: an opt-in `$decide` capability skill and a small one-shot Node.js tool. It is not a new managed agent or custom model provider. Existing agents inherit their parent provider; their profiles, reasoning resolver, Reviewer and Commit Guard retain their current authority. A later orchestrator integration would require separate scope approval.

The v1 bounds below are design choices, not additional user requirements: text/JSON evidence, manual invocation, one API request per invocation, and no background process. Image inputs, automatic workflow routing, credential administration, OAuth clients, and WIF integration are deferred.

## API and authentication findings

| Option | Current evidence | Proposal |
| --- | --- | --- |
| Project API key | OpenAI documents API-key authentication, environment/secret-manager delivery, expiration and replacement-before-revocation. | Use this for the first delivery, in a project belonging to the API organization linked to the user's benefit. |
| Sign in with ChatGPT OAuth | The documented open-source plan-usage flow grants eligible Responses API access; this is not evidence of authorization for `/v1/decisions` or billing to the linked API organization. | Do not implement or reuse it for Decisions without a documented Decisions authorization and billing contract. Never read Codex login tokens or `auth.json`. |
| API workload identity federation | An external OIDC/certificate identity can be mapped to an API-project service account and exchanged for a short-lived bearer token. Renewal repeats the exchange; it does not return a refresh token. | A future option if the Runner already has a supported identity provider and an administrator configures the mapping. Verify Decisions permissions and project attribution before adoption. |

Decisions currently uses `POST https://api.openai.com/v1/decisions` with `gpt-6-luna`. Its predicate, choice and score answers are not free-form agent responses or tool calls. Estimated probabilities/confidence are advisory, not calibrated approval thresholds.

The subscription benefit covers Decisions usage billed to the linked API organization; it excludes Codex API-key usage. Benefit eligibility and the period allowance do not establish the current remaining credit balance. Purchased balance may be used after free credits run out, so this design cannot promise "free credits only."

Sources checked on the date above: [Decisions](https://developers.openai.com/api/docs/guides/decisions), [API-credit benefit](https://developers.openai.com/api/docs/guides/chatgpt-api-credits), [API-key lifecycle](https://developers.openai.com/api/docs/guides/production-best-practices#api-keys), [Sign in with ChatGPT scopes](https://developers.openai.com/siwc/quickstart), [API workload identity federation](https://developers.openai.com/api/docs/guides/workload-identity-federation).

## Direct invocation and tool contract

Proposed user interface, not installed commands yet:

```text
$decide Choose simple, flow or pipeline for the following task: ...
$decide Classify this failure as product_failure, harness_failure or operational_failure: ...
$decide Score these supplied candidates using these ordered levels: ...
```

The current agent reads the skill, resolves the supplied evidence and allowed answers, then invokes the tool. Missing choices or score levels are clarified before any request. Use only user-supplied text/JSON or explicitly selected files; do not collect an entire repository, conversation, credentials or private configuration automatically. Show the selected evidence scope before transmission. If the context contains a known secret, remove it or request a sanitized input before calling the API; do not claim general secret-detection coverage.

Proposed CLI: `node tools/decisions.js --input request.json` or `--input -` for stdin. The request contains evidence and named questions only, using the documented API shapes. No credential arguments are accepted. A local `--dry-run` validates without retrieving a credential or accessing the network; its output reports bounded metadata, not evidence contents.

Suggested v1 limits: at most 64 KiB of UTF-8 JSON request data, 16 questions, a 30-second overall timeout, and 256 KiB of response data. These are product limits below the API ceiling, not a dollar cap. Reject unsupported types, malformed/oversized input, missing credentials and incompatible output before claiming success. Pin the production HTTPS origin and Decisions path; do not accept a request-supplied endpoint or follow redirects with credentials. Respect the Runner's permission/network policy without adding sandbox or approval overrides.

Return validated named answers, API-returned probabilities/confidence when present, model, safe request ID and actual usage fields. An error has a fixed safe category and no decision. Preserve distinctions between invalid input, missing/invalid credentials, permission denial, rate/quota exhaustion, timeout/network failure and invalid provider output. Never fabricate a decision, fall back to another credential/provider/model, or label a failed request as a pass.

Do not automatically retry HTTP requests in v1. A timeout can have unknown billing/outcome; report that uncertainty without assuming the server canceled. A user may explicitly request another attempt after seeing the outcome. No API answer executes commands, grants approval, changes routing/profile/effort, or satisfies an independent-review or deterministic security gate.

## Storage and initial setup

1. **Persistent storage belongs to the operator.** Prefer the Runner's existing secret store: Windows Credential Manager, macOS Keychain, Linux Secret Service, or an existing managed vault. This proposal does not add three OS-specific vault implementations or a credential daemon.
2. **The v1 tool reads only process-local `OPENAI_API_KEY`.** The operator-controlled launcher resolves the selected secret and injects it into the Decisions tool process. Do not export it globally or switch the parent Codex session to API-key authentication. The tool does not scan `.env` files, query other stores, or read Codex OAuth credentials. An already-running Runner may retain an old environment; its binding must be refreshed before new calls after rotation.
3. **Fallback storage is explicit.** If no vault integration exists, the existing secure key-setup flow or the subsequently user-authorized interactive setup script may write a user-confirmed ignored `.env.local` with owner-only permissions or a Windows ACL limited to the current account, SYSTEM and Administrators. This is plaintext storage with access controls, not encryption. The script parses only the selected file and injects the key into the Decisions child process; `$decide` does not discover env files or execute their contents as shell code. Keep credentials outside replaceable installed support/skill trees. Installation and updates never create keys or rewrite credential files.
4. **Provisioning is a separate operator step.** Before implementation/configuration or any live call, apply the installed `openai-platform-api-key` credential gate: inspect presence without revealing a value, ask reuse versus new, and stop until answered. New-key creation uses the secure Platform picker and explicit local-destination confirmation. If that flow cannot safely deliver to the chosen vault, keep vault provisioning operator-managed; do not invent an unreviewed import or temporary secret-copy procedure.
5. Select the intended project in the linked API organization, a dedicated key label and an expiration. Restrict permissions to the Decisions workload as far as the actual Platform controls allow; do not invent an endpoint-specific scope or request an admin key. A service account is optional for an unattended Runner, subject to organization policy.

Neither the skill nor ordinary process tools print, return or place a credential in argv, prompts, screenshots, logs, reports, Git, examples or configuration committed to Git. Capture sensitive setup output inside its approved secure path. Runtime diagnostics expose only configured/not-configured and operator-provided nonsecret labels; presence does not mean authenticated or credited. Never emit upstream error bodies, authorization headers or stack traces containing request details. Do not claim the secret is inaccessible to the local operator or other processes with equivalent permissions.

## Rotation and revocation

Rotation is an operator-run lifecycle, not a background job or an API-key administration feature of `$decide`:

1. Record nonsecret key label/project, creation and expiration metadata in the operator's secret manager. A 30-day lifetime is a starting recommendation, constrained by the organization's actual maximum; the operator selects the policy.
2. Before expiry, create a replacement in the same intended project through the authorized secure setup path. Keep the old key valid temporarily. Do not send the new key through chat or tool output.
3. Explicitly authorize one small Decisions smoke request with the new credential in an isolated invocation. Validate its typed answer and usage. This verifies that request's authentication/access; project attribution and credit balance are checked separately in Platform by the operator.
4. After success, update the selected secret binding and refresh the Runner's future child-process environment. Do not interrupt active/uncertain requests. Verify one normal invocation uses the new binding; automatic fallback to the old key is forbidden.
5. Once old invocations have finished and the switch is confirmed, the operator revokes the old key. A failed canary leaves the active binding unchanged; an authorized pre-revocation rollback is an explicit binding change, not a hidden credential retry. After revocation, recovery requires a separately provisioned credential.
6. For suspected compromise, revoke immediately, accept interruption, and replace through the same secure process. A 401/403 stops the tool and reports a safe authentication/access error; it never creates or rotates a credential itself.

A future WIF implementation would cache tokens only in the authorized process/secret service, renew before `expires_at` using fresh external identity, and handle concurrency through the existing identity service. It would not treat a project API key as a refresh token. Sign in with ChatGPT refresh-token rotation is a different flow and remains out of scope here.

## Spend and invocation controls

- Manual `$decide` invocation authorizes only the selected bounded request; do not invoke it proactively for every chat or task. A workflow may consume it only after an explicit opt-in integration is separately approved.
- Before a live pilot, the operator selects the project, checks credits and sets suitable Platform spend controls. A tool-side byte limit or a local estimated cost does not enforce a monthly organization budget. Do not turn on auto-recharge or change billing settings.
- Preserve API-reported usage for the current invocation without retaining prompts or answers by default. Do not call organization usage/billing endpoints or require admin credentials in the runtime tool. Persisted audit logging, batch execution and spend automation are deferred.

## Implementation outline and acceptance

This is a proposed sequence for a later authorized implementation, not work to execute during this planning task:

1. Resolve reuse/new credentials and the operator's storage/binding choice under the credential gate; do not create API-backed code or configure credentials before that decision.
2. Add `skills/decide/SKILL.md` and its UI metadata using the existing capability-skill pattern. Add `decide` to `CAPABILITY_SKILL_NAMES` in `scripts/codex_skill_catalog.py` and update existing catalog-dependent install/sync tests and documentation. Do not hand-edit generated roles or installed skills. Verify the release bundle carries the skill and tool through the existing bundle contract.
3. Add `tools/decisions.js` using the repo's supported Node.js baseline (18+) and existing CLI patterns. Keep the direct request/validation/redaction code small; no model gateway, new provider, managed role, OAuth server, secret manager or generalized plugin framework.
4. Use focused existing-style Node tests with mocked HTTP transport and synthetic credentials: valid predicate/choice/score answers, input limits, missing credentials, 401/403, quota/rate limits, timeout, malformed/oversized output, redirect refusal and redacted errors. Prove dry-run makes no network call and no automatic retry/fallback occurs. Use existing skill/install/sync/bundle checks for integration. These are product tests, not new validation infrastructure.
5. After explicit live-call authorization, run one bounded smoke request with the chosen credential. An absent live qualification remains an explicit delivery limitation; mock tests do not prove current account access or billing. Independent review covers the code, test evidence and setup boundaries before any requested commit/push/install/release.

Planning acceptance: the document defines manual invocation, authentication options and their evidence limits, persistent/transient storage ownership, rotation/revocation, bounded requests and costs, repo integration seams, and focused verification. Reviewer PASS means this proposal is coherent and ready for an implementation decision; it is not implementation, API qualification, approval to spend, or formal security assurance.
