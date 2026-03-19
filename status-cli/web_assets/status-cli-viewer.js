(() => {
  const payloadElement = document.getElementById("status-data");
  const configElement = document.getElementById("status-config");
  if (!payloadElement || !configElement) {
    return;
  }

  const data = JSON.parse(payloadElement.textContent || "{}");
  const config = JSON.parse(configElement.textContent || "{}");
  const COLORS = config.colors || {};
  const FIXED_THEME = config.theme || "auto";
  const FOCUS_OPTIONS = ["all", "blocked", "stale", "active"];

  const state = {
    search: "",
    scope: "all",
    matchesOnly: false,
    intervalSeconds: Number((((data.meta || {}).refresh || {}).default_interval_seconds) || 0),
    timerId: null,
    refreshing: false,
    failureCount: 0,
    selectedKey: `run:${(data.run || {}).run_id || "-"}`,
    clientFocus: FOCUS_OPTIONS.includes(String((data.meta || {}).focus || ""))
      ? String((data.meta || {}).focus)
      : "all",
    hoveredKey: "",
    pendingReveal: null,
  };

  function colorFor(status) {
    return COLORS[String(status || "unknown")] || COLORS.unknown || "#475569";
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function el(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setText(id, text) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(text || "");
  }

  function unique(values) {
    const seen = new Set();
    return values.filter((value) => value && !seen.has(value) && seen.add(value));
  }

  function sortedRecord(record) {
    const next = {};
    Object.keys(record || {})
      .sort()
      .forEach((key) => {
        next[key] = record[key];
      });
    return next;
  }

  function refreshConfig() {
    return (data.meta || {}).refresh || {};
  }

  function refreshSources() {
    return refreshConfig().source || {};
  }

  function activeTaskIdsSet() {
    return new Set(((data.run || {}).active_task_ids || []).map((item) => String(item)));
  }

  function activeAgentIdsSet() {
    return new Set(((data.run || {}).active_agent_ids || []).map((item) => String(item)));
  }

  function normalizeClientFocus(value) {
    const normalized = String(value || "all").toLowerCase();
    return FOCUS_OPTIONS.includes(normalized) ? normalized : "all";
  }

  function setRefreshStatus(message) {
    setText("refresh-status", message || "");
  }

  function normalizeRefPath(refPath) {
    return String(refPath || "").split("\\").join("/");
  }

  function encodeRelativePath(refPath) {
    return normalizeRefPath(refPath)
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  function pathToFileUrl(pathText) {
    const normalized = normalizeRefPath(pathText);
    if (!normalized) return null;
    if (/^file:/i.test(normalized)) return normalized;
    if (/^[A-Za-z]:\//.test(normalized)) {
      return (
        "file:///" +
        normalized.slice(0, 2) +
        normalized
          .slice(2)
          .split("/")
          .map((part) => encodeURIComponent(part))
          .join("/")
      );
    }
    if (normalized.startsWith("/")) {
      return (
        "file://" +
        normalized
          .split("/")
          .map((part, index) => (index === 0 ? "" : encodeURIComponent(part)))
          .join("/")
      );
    }
    return null;
  }

  function candidateBaseUrls() {
    const source = refreshSources();
    return unique([
      source.status_root_url,
      source.status_parent_url,
      source.status_dir_url,
      source.output_dir_url,
      source.project_dir_url,
    ]);
  }

  function buildCandidateUrls(refPath) {
    const normalized = normalizeRefPath(refPath);
    if (!normalized) return [];
    const absoluteUrl = pathToFileUrl(normalized);
    if (absoluteUrl) return [absoluteUrl];
    const encoded = encodeRelativePath(normalized);
    const trimmed = normalized.startsWith("status/")
      ? encodeRelativePath(normalized.slice(7))
      : "";
    const urls = [];
    candidateBaseUrls().forEach((base) => {
      try {
        urls.push(new URL(encoded, base).href);
      } catch (_error) {
        // ignore invalid base
      }
      if (trimmed) {
        try {
          urls.push(new URL(trimmed, base).href);
        } catch (_error) {
          // ignore invalid base
        }
      }
    });
    return unique(urls);
  }

  async function fetchJsonUrl(url) {
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    if (response.status && !response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return JSON.parse(text);
  }

  async function fetchJsonFromCandidates(candidates) {
    let lastError = null;
    for (const candidate of candidates) {
      try {
        return { url: candidate, data: await fetchJsonUrl(candidate) };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("No readable local status source was available.");
  }

  function matchesFocus(record, focus, activeIds) {
    const status = String((record || {}).status || "");
    const recordId = String((record || {}).task_id || (record || {}).agent_id || "");
    if (focus === "blocked") return status === "blocked";
    if (focus === "stale") return status === "stale";
    if (focus === "active") {
      return status === "in_progress" || status === "waiting_for_user" || activeIds.has(recordId);
    }
    return false;
  }

  function hotspotMatchesFocus(item, focus) {
    if (!focus || focus === "all") return true;
    const statuses = (item || {}).statuses || {};
    if (focus === "blocked") return Number(statuses.blocked || 0) > 0;
    if (focus === "stale") return Number(statuses.stale || 0) > 0;
    if (focus === "active") {
      return (
        Number((item || {}).active || 0) > 0 ||
        Number(statuses.in_progress || 0) > 0 ||
        Number(statuses.waiting_for_user || 0) > 0
      );
    }
    return true;
  }

  function nodeMatchesClientFocus(node) {
    const focus = state.clientFocus;
    if (!focus || focus === "all") return true;
    if (!node || node.type === "run") return true;
    if (node.type === "task") return matchesFocus(node.detail || {}, focus, activeTaskIdsSet());
    if (node.type === "agent") return matchesFocus(node.detail || {}, focus, activeAgentIdsSet());
    return true;
  }

  function itemMatchesClientFocus(kind, item) {
    const focus = state.clientFocus;
    if (!focus || focus === "all") return true;
    if (kind === "tasks") return matchesFocus((item || {}).record || item || {}, focus, activeTaskIdsSet());
    if (kind === "agents") return matchesFocus((item || {}).record || item || {}, focus, activeAgentIdsSet());
    if (kind === "hotspots") return hotspotMatchesFocus(item, focus);
    return true;
  }

  function focusCount(focus) {
    const taskCounts = (data.run || {}).task_counts || {};
    const panels = data.panels || {};
    if (focus === "all") {
      return (data.tasks || []).length || Object.values(taskCounts).reduce((a, b) => a + Number(b || 0), 0);
    }
    if (focus === "blocked") return Number(taskCounts.blocked || (panels.blocked || []).length || 0);
    if (focus === "stale") return Number(taskCounts.stale || (panels.stale || []).length || 0);
    if (focus === "active") {
      return ((data.run || {}).active_task_ids || []).length || (panels.active || []).length || 0;
    }
    return 0;
  }

  function parseKey(key) {
    const raw = String(key || "");
    const index = raw.indexOf(":");
    if (index === -1) return { type: "", id: raw };
    return { type: raw.slice(0, index), id: raw.slice(index + 1) };
  }

  function relatedKeysFor(key) {
    const related = new Set();
    const normalized = String(key || "");
    if (!normalized) return related;
    related.add(normalized);
    const parsed = parseKey(normalized);
    const runKey = `run:${(data.run || {}).run_id || "-"}`;
    if (parsed.type === "task") {
      related.add(runKey);
      (data.agents || []).forEach((agent) => {
        if (String(agent.task_id || "") === parsed.id) {
          related.add(`agent:${agent.agent_id || ""}`);
        }
      });
    } else if (parsed.type === "agent") {
      related.add(runKey);
      const agent = (data.agents || []).find((item) => String(item.agent_id || "") === parsed.id);
      if (agent && agent.task_id) related.add(`task:${agent.task_id}`);
    }
    return related;
  }

  function setHoveredKey(key) {
    state.hoveredKey = String(key || "");
    applyInteractionState();
  }

  function clearHoveredKey(key) {
    if (!key || state.hoveredKey === String(key)) {
      state.hoveredKey = "";
      applyInteractionState();
    }
  }

  function revealListCard(key, behavior) {
    const escapedKey = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(String(key || "")) : String(key || "").replaceAll('"', '\\"');
    const card = document.querySelector(`.item[data-node-key="${escapedKey}"]`);
    if (!card) return false;
    const disclosure = card.closest("details.panel");
    if (disclosure) disclosure.open = true;
    card.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
    return true;
  }

  function revealGraphNode(key, behavior) {
    const wrapper = document.querySelector(".graph-wrap");
    const escapedKey = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(String(key || "")) : String(key || "").replaceAll('"', '\\"');
    const node = document.querySelector(`.graph-node[data-node-key="${escapedKey}"]`);
    if (!wrapper || !node || typeof node.getBBox !== "function") return false;
    try {
      const box = node.getBBox();
      const targetLeft = Math.max(box.x - 48, 0);
      const targetTop = Math.max(box.y - 48, 0);
      wrapper.scrollTo({ left: targetLeft, top: targetTop, behavior });
      return true;
    } catch (_error) {
      return false;
    }
  }

  function revealSelectedContent() {
    const reason = state.pendingReveal;
    state.pendingReveal = null;
    if (!reason || !state.selectedKey) return;
    const behavior = reason === "hash" ? "auto" : "smooth";
    const detailShell = document.getElementById("detail-shell");
    if (reason === "graph") {
      revealListCard(state.selectedKey, behavior);
      if (detailShell) detailShell.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
      return;
    }
    if (reason === "list") {
      revealGraphNode(state.selectedKey, behavior);
      if (detailShell) detailShell.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
      return;
    }
    revealListCard(state.selectedKey, behavior);
    revealGraphNode(state.selectedKey, behavior);
  }

  function activateSelection(key, record, reason) {
    state.selectedKey = String(key || "");
    state.pendingReveal = reason || "selection";
    showDetail(state.selectedKey, record || {});
    syncHash();
    rerenderAll();
  }

  function bindInteractive(node, key, record, reason) {
    node.classList.add("clickable");
    node.dataset.nodeKey = String(key || "");
    if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "0");
    node.addEventListener("click", () => activateSelection(key, record, reason));
    node.addEventListener("mouseenter", () => setHoveredKey(key));
    node.addEventListener("mouseleave", () => clearHoveredKey(key));
    node.addEventListener("focus", () => setHoveredKey(key));
    node.addEventListener("blur", () => clearHoveredKey(key));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateSelection(key, record, reason);
      }
    });
  }

  function applyInteractionState() {
    const selectedRelated = relatedKeysFor(state.selectedKey);
    const hoveredRelated = relatedKeysFor(state.hoveredKey);
    document.querySelectorAll("[data-node-key]").forEach((node) => {
      const key = String(node.getAttribute("data-node-key") || "");
      node.classList.toggle("is-selected", Boolean(state.selectedKey) && key === state.selectedKey);
      node.classList.toggle("is-related-selected", key !== state.selectedKey && selectedRelated.has(key));
      node.classList.toggle("is-hovered", Boolean(state.hoveredKey) && key === state.hoveredKey);
      node.classList.toggle("is-related-hover", key !== state.hoveredKey && hoveredRelated.has(key));
    });
    document.querySelectorAll(".graph-edge").forEach((edge) => {
      const from = String(edge.getAttribute("data-edge-from") || "");
      const to = String(edge.getAttribute("data-edge-to") || "");
      const isSelectedEdge = Boolean(state.selectedKey) && (from === state.selectedKey || to === state.selectedKey);
      const isRelatedSelectedEdge = !isSelectedEdge && selectedRelated.has(from) && selectedRelated.has(to);
      const isHoveredEdge = Boolean(state.hoveredKey) && (from === state.hoveredKey || to === state.hoveredKey);
      const isRelatedHoveredEdge = !isHoveredEdge && hoveredRelated.has(from) && hoveredRelated.has(to);
      edge.classList.toggle("is-selected", isSelectedEdge);
      edge.classList.toggle("is-related-selected", isRelatedSelectedEdge);
      edge.classList.toggle("is-hovered", isHoveredEdge);
      edge.classList.toggle("is-related-hover", isRelatedHoveredEdge);
    });
    const detailShell = document.getElementById("detail-shell");
    if (detailShell) {
      detailShell.classList.toggle("has-selection", Boolean(state.selectedKey));
      detailShell.classList.toggle("has-hover", Boolean(state.hoveredKey));
    }
  }

  function buildHotspots(agents, activeAgentIds, focus) {
    const filtered = focus
      ? agents.filter((agent) => matchesFocus(agent, focus, activeAgentIds))
      : agents;
    const rollups = {};
    filtered.forEach((agent) => {
      const name = String(agent.agent || "unknown");
      if (!rollups[name]) {
        rollups[name] = {
          agent: name,
          count: 0,
          active: 0,
          cleanup_issues: 0,
          statuses: {},
          tasks: [],
        };
      }
      const rollup = rollups[name];
      rollup.count += 1;
      if (activeAgentIds.has(String(agent.agent_id || ""))) rollup.active += 1;
      const status = String(agent.status || "unknown");
      rollup.statuses[status] = Number(rollup.statuses[status] || 0) + 1;
      if (
        agent.cleanup_status === "failed" ||
        agent.cleanup_status === "unknown" ||
        agent.resource_status === "cleanup_failed" ||
        agent.resource_status === "unknown"
      ) {
        rollup.cleanup_issues += 1;
      }
      if (agent.task_id && !rollup.tasks.includes(agent.task_id)) {
        rollup.tasks.push(agent.task_id);
      }
    });
    return Object.values(rollups).sort(
      (a, b) =>
        b.cleanup_issues - a.cleanup_issues ||
        b.active - a.active ||
        b.count - a.count ||
        String(a.agent).localeCompare(String(b.agent)),
    );
  }

  async function loadReferencedRecords(runStatus, refKey, idKey) {
    const refs = Array.isArray(runStatus[refKey]) ? runStatus[refKey] : [];
    const records = [];
    const warnings = [];
    const entityName = String(idKey).endsWith("_id") ? String(idKey).slice(0, -3) : String(idKey);
    for (const item of refs) {
      if (!item || typeof item !== "object") continue;
      const entityId = item[idKey];
      const refPath = item.path;
      if (!entityId || !refPath) continue;
      const candidates = buildCandidateUrls(String(refPath));
      if (!candidates.length) {
        warnings.push(`Missing ${entityName} file for ${entityId}: ${refPath}`);
        continue;
      }
      try {
        const loaded = await fetchJsonFromCandidates(candidates);
        records.push(loaded.data);
      } catch (_error) {
        warnings.push(`Missing ${entityName} file for ${entityId}: ${refPath}`);
      }
    }
    return { records, warnings };
  }

  async function buildPayloadFromRunStatus(runStatus, loadedFrom) {
    const focus = (data.meta || {}).focus || null;
    const refresh = refreshConfig();
    const activeTaskIds = new Set((runStatus.active_task_ids || []).map((item) => String(item)));
    const activeAgentIds = new Set((runStatus.active_agent_ids || []).map((item) => String(item)));
    const runId = String(runStatus.run_id || "-");
    const payload = {
      meta: {
        title: `Status viewer: ${runId}`,
        focus,
        loaded_from: String(loadedFrom || (data.meta || {}).loaded_from || ""),
        read_only: true,
        viewer_label: (data.meta || {}).viewer_label || "Read-only web export",
        refresh,
      },
      run: {
        run_id: runStatus.run_id,
        status: runStatus.status,
        orchestrator: runStatus.orchestrator,
        layout: runStatus.layout || "-",
        current_stage: runStatus.current_stage,
        next_stage: runStatus.next_stage,
        updated_at: runStatus.updated_at,
        last_heartbeat_at: runStatus.last_heartbeat_at,
        waiting_on: runStatus.waiting_on,
        resume_from_checkpoint: runStatus.resume_from_checkpoint,
        last_error: runStatus.last_error,
        task_counts: Object.assign({}, runStatus.task_counts || {}),
        active_task_ids: Array.from(activeTaskIds).sort(),
        active_agent_ids: Array.from(activeAgentIds).sort(),
        record: sortedRecord(runStatus),
      },
      tasks: [],
      agents: [],
      warnings: [],
      hotspots: [],
      panels: { blocked: [], stale: [], active: [] },
      graph: {
        nodes: [
          {
            id: `run:${runId}`,
            type: "run",
            label: runId,
            status: String(runStatus.status || "unknown"),
            subtitle: String(runStatus.orchestrator || "-"),
            column: 0,
            detail: sortedRecord(runStatus),
          },
        ],
        edges: [],
      },
    };

    if (runStatus.layout !== "expanded") {
      const counts = payload.run.task_counts || {};
      payload.panels.blocked = [
        { task_id: "run-only", summary: `count=${counts.blocked || 0} (details unavailable in run-only layout)`, status: "blocked" },
      ];
      payload.panels.stale = [
        { task_id: "run-only", summary: `count=${counts.stale || 0} (details unavailable in run-only layout)`, status: "stale" },
      ];
      payload.panels.active = [
        {
          task_id: "run-only",
          summary: payload.run.active_task_ids.length ? payload.run.active_task_ids.join(", ") : "none",
          status: payload.run.active_task_ids.length ? "in_progress" : "unknown",
        },
      ];
      return payload;
    }

    const loadedTasks = await loadReferencedRecords(runStatus, "task_refs", "task_id");
    const loadedAgents = await loadReferencedRecords(runStatus, "agent_refs", "agent_id");
    payload.warnings = loadedTasks.warnings.concat(loadedAgents.warnings);

    const taskCardById = {};
    const taskCards = [];
    loadedTasks.records.forEach((task) => {
      const taskId = String(task.task_id || "");
      const card = {
        task_id: task.task_id,
        summary: task.summary,
        status: String(task.status || "unknown"),
        assigned_agent_id: task.assigned_agent_id,
        assigned_executor: task.assigned_executor,
        resource_status: task.resource_status,
        result_summary: task.result_summary,
        error: task.error,
        resume_note: task.resume_note,
        record: sortedRecord(task),
      };
      taskCards.push(card);
      taskCardById[taskId] = card;
      payload.graph.nodes.push({
        id: `task:${taskId}`,
        type: "task",
        label: taskId,
        status: String(task.status || "unknown"),
        subtitle: String(task.summary || "-"),
        column: 1,
        detail: sortedRecord(task),
      });
      payload.graph.edges.push({ from: `run:${runId}`, to: `task:${taskId}`, status: String(task.status || "unknown") });
    });

    const agentCards = [];
    loadedAgents.records.forEach((agent) => {
      const agentId = String(agent.agent_id || "");
      const taskId = String(agent.task_id || "");
      const card = {
        agent_id: agent.agent_id,
        agent: agent.agent,
        status: String(agent.status || "unknown"),
        task_id: agent.task_id,
        attempt: agent.attempt,
        cleanup_status: agent.cleanup_status,
        resource_status: agent.resource_status,
        result_summary: agent.result_summary,
        error: agent.error,
        resource_handles: agent.resource_handles,
        record: sortedRecord(agent),
      };
      agentCards.push(card);
      payload.graph.nodes.push({
        id: `agent:${agentId}`,
        type: "agent",
        label: agentId,
        status: String(agent.status || "unknown"),
        subtitle: String(agent.agent || "-"),
        column: 2,
        detail: sortedRecord(agent),
      });
      payload.graph.edges.push({ from: `task:${taskId}`, to: `agent:${agentId}`, status: String(agent.status || "unknown") });
    });

    Array.from(activeTaskIds)
      .sort()
      .forEach((taskId) => {
        if (!taskCardById[taskId]) {
          payload.warnings.push(`Missing task file for active task ${taskId}.`);
        }
      });

    payload.panels.blocked = taskCards.filter((item) => item.status === "blocked");
    payload.panels.stale = taskCards.filter((item) => item.status === "stale");
    payload.panels.active = Array.from(activeTaskIds)
      .sort()
      .filter((taskId) => taskCardById[taskId])
      .map((taskId) => taskCardById[taskId]);
    payload.tasks = focus ? taskCards.filter((item) => matchesFocus(item.record, focus, activeTaskIds)) : taskCards;
    payload.agents = focus ? agentCards.filter((item) => matchesFocus(item.record, focus, activeAgentIds)) : agentCards;
    if (focus) {
      ["blocked", "stale", "active"].forEach((key) => {
        payload.panels[key] = payload.panels[key].filter((item) => !item.record || matchesFocus(item.record, focus, activeTaskIds));
      });
    }
    payload.hotspots = buildHotspots(loadedAgents.records, activeAgentIds, focus);
    return payload;
  }

  function replaceData(nextData) {
    Object.keys(data).forEach((key) => delete data[key]);
    Object.assign(data, nextData);
  }

  function searchEnabledFor(kind) {
    return state.scope === "all" || state.scope === kind;
  }

  function textForSearch(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  function recordMatches(kind, record, extraText) {
    const term = state.search.trim().toLowerCase();
    if (!term) return true;
    if (!searchEnabledFor(kind)) return true;
    const haystack = `${textForSearch(record)} ${textForSearch(extraText)}`.toLowerCase();
    return haystack.includes(term);
  }

  function visibilityFor(kind, record, extraText) {
    const match = recordMatches(kind, record, extraText);
    const shouldFilter = Boolean(state.search.trim()) && searchEnabledFor(kind) && state.matchesOnly;
    return { match, visible: !shouldFilter || match };
  }

  function highlightText(text) {
    const raw = String(text || "");
    const term = state.search.trim();
    if (!term) return escapeHtml(raw);
    const lowerRaw = raw.toLowerCase();
    const lowerTerm = term.toLowerCase();
    let cursor = 0;
    let html = "";
    while (true) {
      const index = lowerRaw.indexOf(lowerTerm, cursor);
      if (index === -1) {
        html += escapeHtml(raw.slice(cursor));
        break;
      }
      html += escapeHtml(raw.slice(cursor, index));
      html += `<mark class="mark">${escapeHtml(raw.slice(index, index + term.length))}</mark>`;
      cursor = index + term.length;
    }
    return html;
  }

  function renderHero() {
    const run = data.run || {};
    setText("viewer-label", String((data.meta || {}).viewer_label || "Read-only web export"));
    setText("hero-title", `${run.run_id || "-"} · ${run.status || "unknown"}`);
    setText(
      "hero-subtitle",
      `Layout=${run.layout || "-"}. Orchestrator=${run.orchestrator || "-"}. Loaded from ${(data.meta || {}).loaded_from || "-"}.`,
    );
    const meta = document.getElementById("hero-meta");
    clearNode(meta);
    [
      `theme=${FIXED_THEME}`,
        `focus=${state.clientFocus || "all"}`,
      `asset_mode=${config.asset_mode || "inline"}`,
      `waiting_on=${run.waiting_on ?? "-"}`,
      `current_stage=${run.current_stage ?? "-"}`,
      `next_stage=${run.next_stage ?? "-"}`,
      `updated=${run.updated_at ?? "-"}`,
      `heartbeat=${run.last_heartbeat_at ?? "-"}`,
    ].forEach((text) => meta.appendChild(el("span", "pill", text)));

    const stats = document.getElementById("stats");
    clearNode(stats);
    const counts = run.task_counts || {};
    const searchHits = countVisibleSearchHits();
    [
      ["Tasks", data.tasks.length || Object.values(counts).reduce((a, b) => a + Number(b || 0), 0), `layout=${run.layout || "-"}`],
      ["Agents", data.agents.length, run.layout === "expanded" ? "expanded detail loaded" : "run-only layout"],
      ["Blocked", Number(counts.blocked || 0), "requires review"],
      ["Stale", Number(counts.stale || 0), "resume or reconcile"],
      ["Active refs", (run.active_task_ids || []).length + (run.active_agent_ids || []).length, "current pointers"],
      ["Search hits", searchHits, state.search ? `scope=${state.scope}` : "type to filter/highlight"],
      ["Client focus", state.clientFocus === "all" ? "All" : state.clientFocus, "hash-persisted local lens"],
    ].forEach(([label, value, sub]) => {
      const card = el("div", "stat");
      card.appendChild(el("div", "stat-label", String(label)));
      card.appendChild(el("div", "stat-value", String(value)));
      card.appendChild(el("div", "stat-sub", String(sub)));
      stats.appendChild(card);
    });
  }

  function countVisibleSearchHits() {
    if (!state.search.trim()) return 0;
    let count = 0;
    (data.tasks || []).forEach((item) => {
      if (searchEnabledFor("tasks") && recordMatches("tasks", item.record || item, item.summary)) count += 1;
    });
    (data.agents || []).forEach((item) => {
      if (searchEnabledFor("agents") && recordMatches("agents", item.record || item, item.agent)) count += 1;
    });
    (data.warnings || []).forEach((item) => {
      if (searchEnabledFor("warnings") && recordMatches("warnings", item, item)) count += 1;
    });
    (data.hotspots || []).forEach((item) => {
      if (searchEnabledFor("hotspots") && recordMatches("hotspots", item, item.agent)) count += 1;
    });
    return count;
  }

  function taskCard(item) {
    const card = el("div", "item");
    const key = `task:${item.task_id || "task"}`;
    const stateView = visibilityFor("tasks", item.record || item, item.summary || "");
    const focusMatch = itemMatchesClientFocus("tasks", item);
    if (state.search.trim()) {
      card.classList.add(stateView.match ? "is-match" : "is-dim");
    }
    if (!focusMatch) card.classList.add("is-focus-dim");
    const top = el("div", "item-top");
    const left = el("div");
    const title = el("div", "item-title");
    title.innerHTML = highlightText(item.task_id || "task");
    left.appendChild(title);
    const subtitle = el("div", "item-sub");
    subtitle.innerHTML = highlightText(item.summary || "");
    left.appendChild(subtitle);
    top.appendChild(left);
    const pill = el("div", "status-pill", String(item.status || "unknown"));
    pill.style.background = colorFor(item.status);
    top.appendChild(pill);
    card.appendChild(top);
    const chips = el("div", "chips");
    [
      item.assigned_agent_id && `agent=${item.assigned_agent_id}`,
      item.assigned_executor && `executor=${item.assigned_executor}`,
      item.resource_status && `resource=${item.resource_status}`,
    ]
      .filter(Boolean)
      .forEach((text) => chips.appendChild(el("div", "chip", text)));
    if (chips.childNodes.length) card.appendChild(chips);
    if (item.error) card.appendChild(el("div", "item-sub", `issue: ${item.error}`));
    if (item.resume_note) card.appendChild(el("div", "item-sub", `resume: ${item.resume_note}`));
    bindInteractive(card, key, item.record || item, "list");
    return { node: card, visible: stateView.visible && focusMatch };
  }

  function agentCard(item) {
    const card = el("div", "item");
    const key = `agent:${item.agent_id || "agent"}`;
    const stateView = visibilityFor("agents", item.record || item, `${item.agent || ""} ${item.task_id || ""}`);
    const focusMatch = itemMatchesClientFocus("agents", item);
    if (state.search.trim()) {
      card.classList.add(stateView.match ? "is-match" : "is-dim");
    }
    if (!focusMatch) card.classList.add("is-focus-dim");
    const top = el("div", "item-top");
    const left = el("div");
    const title = el("div", "item-title");
    title.innerHTML = highlightText(item.agent_id || "agent");
    left.appendChild(title);
    const subtitle = el("div", "item-sub");
    subtitle.innerHTML = highlightText(`${item.agent || "unknown"} · task=${item.task_id || "-"}`);
    left.appendChild(subtitle);
    top.appendChild(left);
    const pill = el("div", "status-pill", String(item.status || "unknown"));
    pill.style.background = colorFor(item.status);
    top.appendChild(pill);
    card.appendChild(top);
    const chips = el("div", "chips");
    [
      item.attempt !== undefined && item.attempt !== null && `attempt=${item.attempt}`,
      item.cleanup_status && `cleanup=${item.cleanup_status}`,
      item.resource_status && `resource=${item.resource_status}`,
    ]
      .filter(Boolean)
      .forEach((text) => chips.appendChild(el("div", "chip", text)));
    if (chips.childNodes.length) card.appendChild(chips);
    if (item.error) card.appendChild(el("div", "item-sub", `issue: ${item.error}`));
    bindInteractive(card, key, item.record || item, "list");
    return { node: card, visible: stateView.visible && focusMatch };
  }

  function hotspotCard(item) {
    const card = el("div", "item");
    const stateView = visibilityFor("hotspots", item, item.agent || "");
    const focusMatch = itemMatchesClientFocus("hotspots", item);
    if (state.search.trim()) {
      card.classList.add(stateView.match ? "is-match" : "is-dim");
    }
    if (!focusMatch) card.classList.add("is-focus-dim");
    const top = el("div", "item-top");
    const title = el("div", "item-title");
    title.innerHTML = highlightText(item.agent || "unknown");
    top.appendChild(title);
    const pill = el("div", "status-pill", `count ${item.count}`);
    pill.style.background = colorFor(item.cleanup_issues ? "blocked" : item.active ? "in_progress" : "done");
    top.appendChild(pill);
    card.appendChild(top);
    const chips = el("div", "chips");
    [`active=${item.active}`, `cleanup_issues=${item.cleanup_issues}`].forEach((text) => chips.appendChild(el("div", "chip", text)));
    Object.entries(item.statuses || {}).forEach(([status, count]) => chips.appendChild(el("div", "chip", `${status}=${count}`)));
    (item.tasks || []).forEach((task) => chips.appendChild(el("div", "chip", `task=${task}`)));
    card.appendChild(chips);
    return { node: card, visible: stateView.visible && focusMatch };
  }

  function warningCard(text) {
    const card = el("div", "item");
    const stateView = visibilityFor("warnings", { text }, text);
    if (state.search.trim()) {
      card.classList.add(stateView.match ? "is-match" : "is-dim");
    }
    const top = el("div", "item-top");
    top.appendChild(el("div", "item-title", "warning"));
    const pill = el("div", "status-pill", "attention");
    pill.style.background = colorFor("waiting_for_user");
    top.appendChild(pill);
    card.appendChild(top);
    const body = el("div", "item-sub");
    body.innerHTML = highlightText(text);
    card.appendChild(body);
    return { node: card, visible: stateView.visible };
  }

  function renderItemList(targetId, items, builder) {
    const root = document.getElementById(targetId);
    clearNode(root);
    let visibleCount = 0;
    (items || []).forEach((item) => {
      const built = builder(item);
      if (built.visible) {
        root.appendChild(built.node);
        visibleCount += 1;
      }
    });
    if (!visibleCount) {
      root.appendChild(el("div", "empty", state.search.trim() ? "no matching items" : "none"));
    }
    return visibleCount;
  }

  function showDetail(title, record) {
    state.selectedKey = String(title || state.selectedKey || "");
    setText("detail-caption", title || "selected record");
    setText("detail", JSON.stringify(record || {}, null, 2));
  }

  function restoreDetail() {
    const key = String(state.selectedKey || `run:${(data.run || {}).run_id || "-"}`);
    const node = (data.graph.nodes || []).find((item) => item.id === key);
    if (node) {
      showDetail(key, node.detail || {});
      return;
    }
    showDetail(`run:${(data.run || {}).run_id || "-"}`, (data.run || {}).record || {});
  }

  function renderLegend() {
    const legend = document.getElementById("legend");
    clearNode(legend);
    Object.entries(COLORS).forEach(([status, color]) => {
      if (status === "run") return;
      const item = el("div", "legend-item");
      const dot = el("span", "dot");
      dot.style.background = color;
      item.appendChild(dot);
      item.appendChild(el("span", "", status));
      legend.appendChild(item);
    });
  }

  function graphNodeMatches(node) {
    if (!nodeMatchesClientFocus(node)) return false;
    if (!state.search.trim()) return true;
    const kind = node.type === "task" ? "tasks" : node.type === "agent" ? "agents" : "all";
    return recordMatches(kind, node.detail || node, `${node.label || ""} ${node.subtitle || ""}`);
  }

  function renderFocusControls() {
    const root = document.getElementById("focus-controls");
    const status = document.getElementById("focus-status");
    if (!root || !status) return;
    clearNode(root);
    FOCUS_OPTIONS.forEach((focus) => {
      const button = el("button", "focus-chip", `${focus === "all" ? "All" : focus[0].toUpperCase() + focus.slice(1)} · ${focusCount(focus)}`);
      button.type = "button";
      button.dataset.focus = focus;
      if (state.clientFocus === focus) button.classList.add("is-active");
      button.addEventListener("click", () => {
        state.clientFocus = focus;
        syncHash();
        rerenderAll();
      });
      root.appendChild(button);
    });
    setText(
      "focus-status",
      state.clientFocus === "all"
        ? "Local focus is showing the full viewer."
        : `Local focus is highlighting ${state.clientFocus} records without changing source data.`,
    );
  }

  function renderGraph() {
    const svg = document.getElementById("graph");
    const ns = "http://www.w3.org/2000/svg";
    const nodes = data.graph.nodes || [];
    const edges = data.graph.edges || [];
    const columns = [
      nodes.filter((n) => n.column === 0),
      nodes.filter((n) => n.column === 1),
      nodes.filter((n) => n.column === 2),
    ];
    const colX = [80, 420, 760];
    const width = 250;
    const heightBox = 82;
    const maxRows = Math.max(...columns.map((col) => Math.max(col.length, 1)));
    svg.setAttribute("viewBox", `0 0 1080 ${maxRows * 120 + 120}`);
    svg.innerHTML = "";
    const positions = new Map();
    columns.forEach((col, column) => {
      col.forEach((node, row) => positions.set(node.id, { x: colX[column], y: 52 + row * 120 }));
    });

    edges.forEach((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("class", "graph-edge");
      path.setAttribute("data-edge-from", String(edge.from || ""));
      path.setAttribute("data-edge-to", String(edge.to || ""));
      path.setAttribute(
        "d",
        `M ${from.x + width} ${from.y + heightBox / 2} C ${from.x + width + 70} ${from.y + heightBox / 2}, ${to.x - 70} ${to.y + heightBox / 2}, ${to.x} ${to.y + heightBox / 2}`,
      );
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colorFor(edge.status));
      path.setAttribute("stroke-opacity", "0.45");
      path.setAttribute("stroke-width", "3");
      svg.appendChild(path);
    });

    nodes.forEach((node) => {
      const pos = positions.get(node.id);
      if (!pos) return;
      const group = document.createElementNS(ns, "g");
      group.setAttribute("class", "graph-node");
      const match = graphNodeMatches(node);
      if (state.search.trim()) {
        group.classList.add(match ? "is-match" : "is-dim");
      }
      if (!nodeMatchesClientFocus(node)) group.classList.add("is-focus-dim");
      group.setAttribute("data-node-key", String(node.id || ""));
      group.setAttribute("tabindex", "0");

      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", pos.x);
      rect.setAttribute("y", pos.y);
      rect.setAttribute("width", width);
      rect.setAttribute("height", heightBox);
      rect.setAttribute("rx", "18");
      rect.setAttribute("fill", "rgba(15,23,42,0.95)");
      rect.setAttribute("stroke", colorFor(node.type === "run" ? "run" : node.status));
      rect.setAttribute("stroke-width", "2");
      group.appendChild(rect);

      const accent = document.createElementNS(ns, "rect");
      accent.setAttribute("x", pos.x + 10);
      accent.setAttribute("y", pos.y + 10);
      accent.setAttribute("width", "8");
      accent.setAttribute("height", String(heightBox - 20));
      accent.setAttribute("rx", "4");
      accent.setAttribute("fill", colorFor(node.type === "run" ? "run" : node.status));
      group.appendChild(accent);

      const title = document.createElementNS(ns, "text");
      title.setAttribute("x", String(pos.x + 30));
      title.setAttribute("y", String(pos.y + 34));
      title.setAttribute("font-size", "16");
      title.setAttribute("font-weight", "700");
      title.textContent = String(node.label || node.id || "node");
      group.appendChild(title);

      const subtitle = document.createElementNS(ns, "text");
      subtitle.setAttribute("x", String(pos.x + 30));
      subtitle.setAttribute("y", String(pos.y + 58));
      subtitle.setAttribute("font-size", "12");
      subtitle.setAttribute("class", "graph-subtitle");
      subtitle.textContent = String(node.subtitle || "-").slice(0, 44);
      group.appendChild(subtitle);

      const status = document.createElementNS(ns, "text");
      status.setAttribute("x", String(pos.x + 30));
      status.setAttribute("y", String(pos.y + 75));
      status.setAttribute("font-size", "11");
      status.setAttribute("fill", colorFor(node.type === "run" ? "run" : node.status));
      status.textContent = String(node.type === "run" ? "run" : node.status || "unknown");
      group.appendChild(status);

      bindInteractive(group, node.id, node.detail || {}, "graph");
      svg.appendChild(group);
    });
    applyInteractionState();
  }

  function renderSearchControls() {
    const searchInput = document.getElementById("search-input");
    const searchScope = document.getElementById("search-scope");
    const matchesOnly = document.getElementById("matches-only");
    if (!searchInput.dataset.bound) {
      searchInput.addEventListener("input", (event) => {
        state.search = String(event.target.value || "");
        syncHash();
        rerenderAll();
      });
      searchScope.addEventListener("change", (event) => {
        state.scope = String(event.target.value || "all");
        syncHash();
        rerenderAll();
      });
      matchesOnly.addEventListener("change", (event) => {
        state.matchesOnly = Boolean(event.target.checked);
        syncHash();
        rerenderAll();
      });
      searchInput.dataset.bound = "true";
    }
    searchInput.value = state.search;
    searchScope.value = state.scope;
    matchesOnly.checked = state.matchesOnly;
    setText(
      "search-status",
      state.search
        ? `Search active for ${state.scope}. ${state.matchesOnly ? "Showing matches only." : "Highlighting matches."}`
        : "Search is presentational only and never changes source data.",
    );
  }

  function renderRefreshControls() {
    const refresh = refreshConfig();
    setText("refresh-note", String(refresh.warning || ""));
    setText("refresh-warning", "Read-only only: this viewer never controls the pipeline and never writes back to status artifacts.");
    const select = document.getElementById("refresh-interval");
    if (!select.dataset.bound) {
      clearNode(select);
      const off = document.createElement("option");
      off.value = "0";
      off.textContent = "Off";
      select.appendChild(off);
      (refresh.interval_options_seconds || []).forEach((value) => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = `${value}s`;
        select.appendChild(option);
      });
      select.addEventListener("change", (event) => {
        state.intervalSeconds = Number(event.target.value || 0);
        restartPolling();
      });
      document.getElementById("refresh-now").addEventListener("click", () => refreshFromSource("manual"));
      select.dataset.bound = "true";
    }
    select.value = String(state.intervalSeconds);
  }

  function loadHashState() {
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(raw);
    state.selectedKey = params.get("node") || state.selectedKey;
    state.search = params.get("search") || state.search;
    state.scope = params.get("scope") || state.scope;
    state.matchesOnly = params.get("matches") === "1";
    state.clientFocus = normalizeClientFocus(params.get("focus") || state.clientFocus);
    if (params.get("node")) state.pendingReveal = "hash";
  }

  function syncHash() {
    const params = new URLSearchParams();
    if (state.selectedKey) params.set("node", state.selectedKey);
    if (state.search) params.set("search", state.search);
    if (state.scope && state.scope !== "all") params.set("scope", state.scope);
    if (state.matchesOnly) params.set("matches", "1");
    if (state.clientFocus && state.clientFocus !== "all") params.set("focus", state.clientFocus);
    const nextHash = params.toString();
    if (`#${nextHash}` !== window.location.hash) {
      history.replaceState(null, "", nextHash ? `#${nextHash}` : window.location.pathname + window.location.search);
    }
  }

  function rerenderListsOnly() {
    renderItemList("blocked-list", (data.panels || {}).blocked || [], taskCard);
    renderItemList("stale-list", (data.panels || {}).stale || [], taskCard);
    renderItemList("active-list", (data.panels || {}).active || [], taskCard);
    const taskCount = renderItemList("task-list", data.tasks || [], taskCard);
    const agentCount = renderItemList("agent-list", data.agents || [], agentCard);
    const hotspotCount = renderItemList("hotspots", data.hotspots || [], hotspotCard);
    const warningCount = renderItemList("warnings", data.warnings || [], warningCard);
    setText("task-list-meta", `${taskCount} visible`);
    setText("agent-list-meta", `${agentCount} visible`);
    setText("hotspot-meta", `${hotspotCount} visible`);
    setText("warning-meta", `${warningCount} visible`);
    applyInteractionState();
  }

  function rerenderAll() {
    renderHero();
    renderFocusControls();
    renderSearchControls();
    renderRefreshControls();
    rerenderListsOnly();
    renderLegend();
    renderGraph();
    restoreDetail();
    revealSelectedContent();
    applyInteractionState();
  }

  function stopPolling() {
    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function restartPolling() {
    stopPolling();
    state.failureCount = 0;
    renderRefreshControls();
    if (state.intervalSeconds > 0) {
      state.timerId = window.setInterval(() => refreshFromSource("poll"), state.intervalSeconds * 1000);
      setRefreshStatus(`Auto refresh every ${state.intervalSeconds}s.`);
    } else {
      setRefreshStatus("Auto refresh is off.");
    }
  }

  async function refreshFromSource(reason) {
    if (state.refreshing) return;
    const source = refreshSources();
    const payloadUrl = String(source.payload_url || "");
    const runStatusUrl = String(source.run_status_url || "");
    if (!payloadUrl && !runStatusUrl) {
      setRefreshStatus("Live refresh unavailable: no original status source was embedded in this viewer.");
      return;
    }
    state.refreshing = true;
    setRefreshStatus(reason === "manual" ? "Refreshing now…" : "Polling original local status artifacts…");
    try {
      let nextData;
      if (payloadUrl) {
        const loaded = await fetchJsonFromCandidates([payloadUrl]);
        nextData = loaded.data;
      } else {
        const loaded = await fetchJsonFromCandidates([runStatusUrl]);
        nextData = await buildPayloadFromRunStatus(loaded.data, loaded.url);
      }
      replaceData(nextData);
      state.failureCount = 0;
      rerenderAll();
      setRefreshStatus(
        "Live refresh updated at " +
          new Date().toLocaleTimeString() +
          (state.intervalSeconds > 0 ? ` · next poll in ${state.intervalSeconds}s.` : "."),
      );
    } catch (_error) {
      state.failureCount += 1;
      const maxFailures = Number(refreshConfig().max_failures || 1);
      if (state.failureCount >= maxFailures) {
        stopPolling();
        setRefreshStatus(`Live refresh unavailable after ${state.failureCount} failed attempt(s).`);
      } else {
        setRefreshStatus(`Refresh attempt failed (${state.failureCount}/${maxFailures}). The viewer stays read-only.`);
      }
    } finally {
      state.refreshing = false;
      renderRefreshControls();
    }
  }

  loadHashState();
  rerenderAll();
  restartPolling();
})();
