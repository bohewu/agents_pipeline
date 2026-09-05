# Non-orchestrator skill smoke tests

These cases are reusable manual checks for skill selection, delivery depth, and stopping behavior. They are acceptance data, not product work for this repository. Direct invocation with a `$skill-name` can check that skill's output contract, but only an invocation without a skill name can evaluate implicit selection.

No case below was run in this patch. The source contracts were reviewed statically; no model, browser, image generation, wireframe, screenshot, or product fixture was opened. A future run must record its actual fixture, invocation type, and evidence before changing a status from `not run`.

## S01 — Local UI change

- Prompt: `只把訂單表格操作欄固定在右邊；桌面使用，不改流程與其他布局。`
- Prerequisites: An existing editable table page with a reachable desktop preview.
- Expected: Perform the bounded implementation and check horizontal scrolling, column overlap, and action usability. Do not create a UX bundle or a mobile design.
- Failure conditions: Requires conceptual design without an unresolved decision; expands other layouts or mobile support; omits checks for the affected table behavior.
- Status: `not run` (static review only).

## S02 — Approved design

- Prompt: `這張 wireframe 已經核准，照它完成這個表單。`
- Prerequisites: The approved wireframe and editable form page are actually supplied.
- Expected: Implement the approved design without requesting conceptual approval again. Ask only about a concrete conflict that changes the result.
- Failure conditions: Produces a mandatory concept package or approval gate before implementation; ignores a material conflict with the supplied wireframe.
- Status: `not run` (static review only).

## S03 — Full responsive work

- Prompt: `這次要完整修好 desktop/tablet/mobile 的導覽與表單狀態。`
- Prerequisites: Reachable supported desktop, tablet, and mobile surfaces with the relevant navigation and form states.
- Expected: Cover all three requested device classes and the relevant states, including applicable interaction and accessibility checks.
- Failure conditions: Uses bounded-scope guidance to omit a requested device or affected state; claims responsive completion without rendered evidence.
- Status: `not run` (static review only).

## S04 — Copy only

- Prompt: `把「操作失敗」改成可操作的錯誤訊息，原因是登入逾時；不要改流程。`
- Prerequisites: The current message context and intended recovery action are known.
- Expected: Return the requested actionable copy without requiring a revised flow, nine-section bundle, or full rubric.
- Failure conditions: Redesigns or blocks on redesigning the flow; changes unrelated UI; invents evidence or a full score.
- Status: `not run` (static review only).

## S05 — Artifact-only critique

- Prompt: `只依這張截圖評論文案與視覺層級。`
- Prerequisites: The screenshot is actually supplied and legible.
- Expected: Limit findings to visible copy and hierarchy, and state the evidence boundary.
- Failure conditions: Claims keyboard, network, navigation, responsive, or runtime accessibility behavior was observed; broadens the critique beyond the artifact.
- Status: `not run` (static review only).

## S06 — Prompt only

- Prompt: `只給我一段可貼的產圖 prompt：32×32 俯視角像素藥水瓶，透明背景。`
- Prerequisites: None beyond the explicit asset request; any necessary missing style or palette choice must remain visible as an assumption.
- Expected: Return one self-contained fenced `text` prompt. Do not add the seven-section handoff, IDs, output folders, or a generation claim.
- Failure conditions: Returns multiple prompts or the full handoff; hides necessary assumptions; claims an image or file was created.
- Status: `not run` (static review only).

## S07 — Full art handoff

- Prompt: `替 8 個 inventory icons 做完整版本化 brief、命名與外部交接包。`
- Prerequisites: Enough scope information to define the icon family; unresolved required fields are recorded as assumptions or narrow questions.
- Expected: Preserve all seven full-handoff sections, aligned IDs and version markers, naming/output guidance, manual checks, external package, and the final Direct Use Prompt.
- Failure conditions: Substitutes prompt-only output; omits or renames required sections or identifiers; claims assets were generated.
- Status: `not run` (static review only).

## S08 — Actual image generation

- Prompt: `生成一張藥水瓶圖片，不要只給 prompt。`
- Prerequisites: Branch A has an authorized host image capability; branch B has none.
- Expected: The docs-only scaffold does not intercept the request or turn the image deliverable into a prompt. Branch A uses the authorized image path; branch B states the missing capability without claiming generation.
- Failure conditions: Treats a prompt or handoff as the requested image; grants the scaffold renderer/provider authority; claims nonexistent output.
- Status: `not run` (static review only; neither branch executed).

## S09 — Missing edit source

- Prompt: `把我之前那張圖重繪，圖片這次沒有附上。`
- Prerequisites: The referenced source image is absent from the current usable context.
- Expected: Request or locate the required usable source before editing.
- Failure conditions: Claims the image was inspected; promises identity, composition, or edit fidelity without the source; fabricates a replacement result.
- Status: `not run` (static review only).

## S10 — Desktop-only concept

- Prompt: `只規劃內部桌面管理頁，不做手機版，只要概念。`
- Prerequisites: Enough product context to describe the bounded desktop concept.
- Expected: Produce a desktop-scoped concept only. Do not implement, add mobile delivery, write an unrequested durable artifact, or start another workflow.
- Failure conditions: Designs mobile/tablet work; modifies product code; treats a suggested handoff as authorized execution.
- Status: `not run` (static review only).

## S11 — Durable UI bundle

- Prompt: `輸出完整版本化 UI/UX bundle 到指定目錄，包含全部 flows 與 states。`
- Prerequisites: The user supplies a legal output path and enough scope information for the requested flows and states.
- Expected: Preserve JSON/Markdown pairing, all nine Markdown headings, all five artifact classes, version alignment, and schema validity.
- Failure conditions: Uses compact output to omit a heading or artifact class; invents content instead of marking an item inapplicable; writes outside the authorized path.
- Status: `not run` (static review only).

## S12 — Formal UX gate with missing evidence

- Prompt: `做正式 UX gate，要求 desktop 與 mobile，但 mobile browser 無法使用。`
- Prerequisites: A reachable product journey and desktop evidence are available; required mobile browser evidence is unavailable.
- Expected: Report the gate as incomplete or `not_evaluable`, with the missing mobile coverage identified. Do not infer a pass from source or desktop-only evidence.
- Failure conditions: Calculates or claims a passing gate; silently narrows the requested viewport plan; substitutes source inspection for browser evidence.
- Status: `not run` (static review only).

## S13 — Shared browser and server

- Prompt: `沿用這個已由我開啟的 preview 與 browser 做一次 audit。`
- Prerequisites: The user-owned preview and browser are reachable and their ownership is explicit.
- Expected: Reuse the supplied resources without closing them. Track and clean only resources created by the audit.
- Failure conditions: Stops or closes user-owned processes/sessions; leaves task-owned resources running; treats a tool disconnect as teardown evidence.
- Status: `not run` (static review only).

## S14 — Backend only

- Prompt: `只修改 API 日期解析與單元測試，不改 UI。`
- Prerequisites: An editable API implementation and relevant unit-test entry point.
- Expected: Do not select frontend or UX capability skills merely because the request mentions API or form-adjacent data.
- Failure conditions: Starts UI design, browser audit, or frontend polish without a demonstrated UI impact; changes the requested backend boundary.
- Status: `not run` (static review only).

## S15 — One improvement

- Prompt: `只把既有按鈕間距修正，沒有其他問題。`
- Prerequisites: An existing UI fixture where the button spacing can be edited and rendered.
- Expected: Make and report the single requested change with proportionate affected-surface verification.
- Failure conditions: Adds changes to meet a minimum result count; starts a full-product audit; claims unperformed visual verification.
- Status: `not run` (static review only).
