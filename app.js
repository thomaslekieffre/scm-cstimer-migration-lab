"use strict";

const APP_VERSION = "v1.0.0";
const STORAGE_META_KEY = "cstimer-migration-v3-meta";
const STORAGE_SESSION_PREFIX = "cstimer-migration-v3-session-";

const WCA_PUZZLES = [
  { id: "222", label: "2x2x2", scrTypes: ["222so", "222eg1", "222eg2", "222nb"] },
  { id: "333", label: "3x3x3", scrTypes: ["333"] },
  { id: "444", label: "4x4x4", scrTypes: ["444wca"] },
  { id: "555", label: "5x5x5", scrTypes: ["555wca"] },
  { id: "666", label: "6x6x6", scrTypes: ["666wca"] },
  { id: "777", label: "7x7x7", scrTypes: ["777wca"] },
  { id: "333oh", label: "3x3 OH", scrTypes: ["333oh"] },
  { id: "clock", label: "Clock", scrTypes: ["clkwca"] },
  { id: "mega", label: "Megaminx", scrTypes: ["mgmp"] },
  { id: "pyram", label: "Pyraminx", scrTypes: ["pyrso"] },
  { id: "skewb", label: "Skewb", scrTypes: ["skbso", "skbo"] },
  { id: "sq1", label: "Square-1", scrTypes: ["sqrs", "sq1h"] },
  { id: "fto", label: "FTO", scrTypes: ["ftoso"] },
  { id: "333bf", label: "3x3 Blindfolded", scrTypes: ["333ni"] },
  { id: "444bf", label: "4x4 Blindfolded", scrTypes: ["444bld"] },
  { id: "555bf", label: "5x5 Blindfolded", scrTypes: ["555bld"] },
  { id: "333mbf", label: "3x3 Multi-Blind", scrTypes: ["r3ni"] },
  { id: "333fm", label: "3x3 Fewest Moves", scrTypes: ["333fm"] },
];

const SCRTYPE_TO_PUZZLE = WCA_PUZZLES.reduce((map, puzzle) => {
  puzzle.scrTypes.forEach((scrType) => {
    map[scrType] = puzzle.id;
  });
  return map;
}, {});

const NAME_TO_PUZZLE = {
  "2x2": "222",
  "3x3": "333",
  "4x4": "444",
  "5x5": "555",
  "6x6": "666",
  "7x7": "777",
  oh: "333oh",
  clock: "clock",
  megaminx: "mega",
  pyraminx: "pyram",
  skewb: "skewb",
  sq1: "sq1",
  square1: "sq1",
  fto: "fto",
  "3bld": "333bf",
  "4bld": "444bf",
  "5bld": "555bf",
  multi: "333mbf",
  fmc: "333fm",
};

const state = {
  selectedPuzzle: "333",
  selectedSessionId: "",
  sessionsById: {},
  isRunning: false,
  startTs: 0,
  rafId: null,
  lastSource: "manuel",
  lastImportFileName: "",
  lastImportReport: null,
};

const puzzleSelectEl = document.getElementById("puzzle-select");
const sessionSelectEl = document.getElementById("session-select");
const timerDisplayEl = document.getElementById("timer-display");
const timerButtonEl = document.getElementById("timer-button");
const fileInputEl = document.getElementById("file-input");
const importButtonEl = document.getElementById("import-button");
const importStatusEl = document.getElementById("import-status");
const summaryEl = document.getElementById("summary");
const solveListEl = document.getElementById("solve-list");
const clearCurrentButtonEl = document.getElementById("clear-current-button");
const clearAllButtonEl = document.getElementById("clear-all-button");
const storageChipEl = document.getElementById("storage-chip");
const importChipEl = document.getElementById("import-chip");
const diagnosticSummaryEl = document.getElementById("diagnostic-summary");
const diagnosticBodyEl = document.getElementById("diagnostic-body");
const copyReportButtonEl = document.getElementById("copy-report-button");
const appVersionEl = document.getElementById("app-version");

bootstrap();

function bootstrap() {
  appVersionEl.textContent = `build beta-test ${APP_VERSION}`;
  loadState();
  initPuzzleOptions();
  ensureManualSessionForPuzzle(state.selectedPuzzle);
  initSessionOptions();
  bindEvents();
  renderAll();
}

function initPuzzleOptions() {
  puzzleSelectEl.innerHTML = "";
  WCA_PUZZLES.forEach((puzzle) => {
    const option = document.createElement("option");
    option.value = puzzle.id;
    option.textContent = puzzle.label;
    puzzleSelectEl.appendChild(option);
  });
  puzzleSelectEl.value = state.selectedPuzzle;
}

function initSessionOptions() {
  const sessions = getSessionsForSelectedPuzzle();
  if (sessions.length === 0) {
    ensureManualSessionForPuzzle(state.selectedPuzzle);
  }
  const refreshed = getSessionsForSelectedPuzzle();
  sessionSelectEl.innerHTML = "";
  refreshed.forEach((session) => {
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = session.name;
    sessionSelectEl.appendChild(option);
  });
  if (!state.selectedSessionId || !refreshed.some((s) => s.id === state.selectedSessionId)) {
    state.selectedSessionId = refreshed[0]?.id || "";
  }
  sessionSelectEl.value = state.selectedSessionId;
}

function bindEvents() {
  puzzleSelectEl.addEventListener("change", () => {
    state.selectedPuzzle = puzzleSelectEl.value;
    ensureManualSessionForPuzzle(state.selectedPuzzle);
    initSessionOptions();
    saveState();
    renderSolves();
  });

  sessionSelectEl.addEventListener("change", () => {
    state.selectedSessionId = sessionSelectEl.value;
    saveState();
    renderSolves();
  });

  timerButtonEl.addEventListener("click", () => {
    toggleTimer();
  });

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat) {
      return;
    }
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
      return;
    }
    event.preventDefault();
    toggleTimer();
  });

  importButtonEl.addEventListener("click", async () => {
    const file = fileInputEl.files?.[0];
    if (!file) {
      setImportStatus("Sélectionne un fichier CSTimer .txt avant import.", true);
      return;
    }

    try {
      const text = await file.text();
      const report = importCSTimerText(text, file.name);
      state.lastSource = "import cstimer";
      state.lastImportFileName = file.name;
      state.lastImportReport = report;
      saveState();
      renderSolves();
      renderDiagnostics();
      setImportStatus(
        `Import OK: ${report.imported} solves importés, ${report.ignored} ignorés, ${report.sessions} sessions traitées.`,
        false
      );
    } catch (error) {
      setImportStatus(`Import échoué: ${error.message}`, true);
    }
  });

  clearCurrentButtonEl.addEventListener("click", () => {
    const session = state.sessionsById[state.selectedSessionId];
    if (session) {
      session.solves = [];
    }
    state.lastSource = "reset puzzle";
    saveState();
    renderSolves();
  });

  clearAllButtonEl.addEventListener("click", () => {
    state.sessionsById = {};
    ensureManualSessionForPuzzle(state.selectedPuzzle);
    initSessionOptions();
    state.lastSource = "reset total";
    state.lastImportFileName = "";
    state.lastImportReport = null;
    saveState();
    renderSolves();
    renderDiagnostics();
  });

  copyReportButtonEl.addEventListener("click", async () => {
    const report = buildBugReportText();
    try {
      await navigator.clipboard.writeText(report);
      setImportStatus("Rapport copié dans le presse-papiers.", false);
    } catch (error) {
      setImportStatus("Impossible de copier automatiquement. Copie manuelle depuis le bloc diagnostic.", true);
    }
  });
}

function toggleTimer() {
  if (state.isRunning) {
    stopTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  state.isRunning = true;
  state.startTs = Date.now();
  timerButtonEl.textContent = "STOP";
  loopTimer();
}

function stopTimer() {
  if (!state.isRunning) {
    return;
  }
  state.isRunning = false;
  const elapsedMs = Date.now() - state.startTs;
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  timerButtonEl.textContent = "START";
  timerDisplayEl.textContent = formatMs(elapsedMs);
  addSolve({
    ms: elapsedMs,
    timestamp: Date.now(),
    penalty: 0,
    source: "manual",
  });
}

function loopTimer() {
  if (!state.isRunning) {
    return;
  }
  const elapsedMs = Date.now() - state.startTs;
  timerDisplayEl.textContent = formatMs(elapsedMs);
  state.rafId = requestAnimationFrame(loopTimer);
}

function addSolve(solve) {
  ensureManualSessionForPuzzle(state.selectedPuzzle);
  if (!state.selectedSessionId || !state.sessionsById[state.selectedSessionId]) {
    initSessionOptions();
  }
  const targetSession = state.sessionsById[state.selectedSessionId];
  if (!targetSession) {
    return;
  }
  targetSession.solves.push(minifySolve(solve));
  state.lastSource = "timer manuel";
  saveState();
  renderSolves();
}

function importCSTimerText(rawText, fileName) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (error) {
    throw new Error("Le fichier n'est pas un JSON CSTimer valide.");
  }

  const properties = data.properties || {};
  const sessionDataRaw = properties.sessionData || "{}";
  let sessionData = {};
  try {
    sessionData = typeof sessionDataRaw === "string" ? JSON.parse(sessionDataRaw) : sessionDataRaw;
  } catch (error) {
    sessionData = {};
  }

  const sessionEntries = Object.entries(data).filter(([key]) => /^session\d+$/.test(key));
  let imported = 0;
  let ignored = 0;
  let replacedSessions = 0;
  const ignoredByScrType = {};

  sessionEntries.forEach(([sessionKey, solves]) => {
    const sessionId = sessionKey.replace("session", "");
    const meta = sessionData[sessionId] || {};
    const scrType = (meta.opt || {}).scrType || "333";
    const puzzleId = resolvePuzzleFromSessionMeta(meta);
    if (!puzzleId || !Array.isArray(solves)) {
      ignored += Array.isArray(solves) ? solves.length : 0;
      const key = String(scrType || "unknown");
      ignoredByScrType[key] = (ignoredByScrType[key] || 0) + (Array.isArray(solves) ? solves.length : 0);
      return;
    }

    const localSessionId = `cstimer-${sessionId}`;
    const sessionName = String(meta.name || `Session ${sessionId}`);
    const existingSession = state.sessionsById[localSessionId];
    const targetSession = existingSession || {
      id: localSessionId,
      name: sessionName,
      puzzleId,
      rank: Number(meta.rank) || Number(sessionId) || 9999,
      source: "cstimer",
      solves: [],
    };
    if (existingSession) {
      replacedSessions += 1;
      existingSession.name = sessionName;
      existingSession.puzzleId = puzzleId;
      existingSession.rank = Number(meta.rank) || Number(sessionId) || 9999;
      existingSession.solves = [];
    }
    state.sessionsById[localSessionId] = targetSession;

    solves.forEach((entry) => {
      const parsed = parseSolveEntry(entry);
      if (!parsed) {
        ignored += 1;
        return;
      }
      targetSession.solves.push({
        ...minifySolve(parsed),
        source: "cstimer",
      });
      imported += 1;
    });
  });

  Object.keys(state.sessionsById).forEach((id) => {
    state.sessionsById[id].solves.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  });
  ensureManualSessionForPuzzle(state.selectedPuzzle);
  initSessionOptions();

  return {
    fileName: fileName || "",
    importedAt: Date.now(),
    sessions: sessionEntries.length,
    replacedSessions,
    imported,
    ignored,
    ignoredByScrType,
    totalSessionsInApp: Object.keys(state.sessionsById).length,
  };
}

function resolvePuzzleFromSessionMeta(meta) {
  const scrType = (meta.opt || {}).scrType || "333";
  if (SCRTYPE_TO_PUZZLE[scrType]) {
    return SCRTYPE_TO_PUZZLE[scrType];
  }
  const normalizedName = String(meta.name || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
  return NAME_TO_PUZZLE[normalizedName] || null;
}

function parseSolveEntry(entry) {
  if (!Array.isArray(entry) || entry.length < 4) {
    return null;
  }
  const [timeRaw, scrambleRaw, commentRaw, timestampRaw] = entry;
  if (!Array.isArray(timeRaw) || timeRaw.length < 2) {
    return null;
  }

  const penalty = Number(timeRaw[0]) || 0;
  const ms = Number(timeRaw[1]);
  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(ms)) {
    return null;
  }

  return {
    ms,
    timestamp: Number.isFinite(timestamp) ? timestamp * 1000 : Date.now(),
    penalty,
  };
}

function renderAll() {
  timerDisplayEl.textContent = "0.00";
  renderSolves();
  renderDiagnostics();
}

function renderSolves() {
  const solves = getCurrentSessionSolves();
  const puzzleSessionsCount = getSessionsForSelectedPuzzle().length;
  const totalAcrossAll = Object.values(state.sessionsById).reduce((sum, session) => sum + session.solves.length, 0);

  summaryEl.textContent = `${solves.length} solves sur cette session | ${puzzleSessionsCount} sessions sur ce puzzle | ${totalAcrossAll} au total.`;
  storageChipEl.textContent = `STOCKAGE: ${estimateStorageKiB()} KB`;
  importChipEl.textContent = `SOURCE: ${String(state.lastSource || "manuel").toUpperCase()}`;
  solveListEl.innerHTML = "";

  const lastSolves = [...solves].slice(-120).reverse();
  lastSolves.forEach((solve, index) => {
    const row = document.createElement("li");
    const left = document.createElement("span");
    const right = document.createElement("span");
    left.textContent = `#${solves.length - index} ${formatSolveDisplay(solve)}`;
    right.className = "muted";
    right.textContent = formatDate(solve.timestamp);
    row.append(left, right);
    solveListEl.appendChild(row);
  });
}

function getSessionsForSelectedPuzzle() {
  return Object.values(state.sessionsById)
    .filter((session) => session.puzzleId === state.selectedPuzzle)
    .sort((a, b) => {
      const rankDiff = (a.rank || 9999) - (b.rank || 9999);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return String(a.name).localeCompare(String(b.name), "fr");
    });
}

function getCurrentSessionSolves() {
  return state.sessionsById[state.selectedSessionId]?.solves || [];
}

function renderDiagnostics() {
  const report = state.lastImportReport;
  if (!report) {
    diagnosticSummaryEl.textContent = "Aucun import exécuté.";
    diagnosticBodyEl.textContent = "-";
    return;
  }
  diagnosticSummaryEl.textContent = `Fichier: ${report.fileName || "-"} | Sessions traitées: ${report.sessions} | Remplacées: ${
    report.replacedSessions
  } | Solves importés: ${report.imported} | Ignorés: ${report.ignored}`;
  diagnosticBodyEl.textContent = buildBugReportText();
}

function buildBugReportText() {
  const report = state.lastImportReport;
  if (!report) {
    return "Aucun rapport d'import disponible.";
  }
  const ignoredEntries = Object.entries(report.ignoredByScrType || {}).sort((a, b) => b[1] - a[1]);
  const ignoredText =
    ignoredEntries.length === 0
      ? "aucun"
      : ignoredEntries.map(([scrType, count]) => `- ${scrType}: ${count}`).join("\n");

  return [
    `[SCM Import Beta ${APP_VERSION}]`,
    `Fichier: ${report.fileName || "-"}`,
    `Date import: ${formatDate(report.importedAt)}`,
    `Sessions CSTimer lues: ${report.sessions}`,
    `Sessions remplacées (réimport): ${report.replacedSessions}`,
    `Solves importés: ${report.imported}`,
    `Solves ignorés: ${report.ignored}`,
    `Sessions présentes dans l'app: ${report.totalSessionsInApp}`,
    `Scramble types ignorés:`,
    ignoredText,
    `Contexte UI: puzzle=${state.selectedPuzzle}, session=${state.selectedSessionId}`,
  ].join("\n");
}

function setImportStatus(message, isError) {
  importStatusEl.textContent = message;
  importStatusEl.style.color = isError ? "#ff0000" : "#008000";
}

function formatSolveDisplay(solve) {
  if (solve.penalty === -1 || solve.ms < 0) {
    return "DNF";
  }
  const plusTwo = solve.penalty === 2000 || solve.penalty === 2;
  const finalMs = solve.ms + (plusTwo ? 2000 : 0);
  const penaltyText = plusTwo ? " (+2)" : "";
  return `${formatMs(finalMs)}${penaltyText}`;
}

function formatMs(ms) {
  const value = Math.max(0, Number(ms) || 0);
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const centis = Math.floor((value % 1000) / 10);
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
  }
  return `${seconds}.${String(centis).padStart(2, "0")}`;
}

function formatDate(ts) {
  if (!Number.isFinite(ts)) {
    return "-";
  }
  return new Date(ts).toLocaleString("fr-FR");
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY);
    if (!raw) {
      migrateFromV1IfNeeded();
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.selectedPuzzle = parsed.selectedPuzzle && WCA_PUZZLES.some((p) => p.id === parsed.selectedPuzzle) ? parsed.selectedPuzzle : "333";
      state.selectedSessionId = parsed.selectedSessionId || "";
      state.lastSource = parsed.lastSource || "manuel";
      state.lastImportFileName = parsed.lastImportFileName || "";
      state.lastImportReport = parsed.lastImportReport || null;
      state.sessionsById = {};
      const sessionIds = Array.isArray(parsed.sessionIds) ? parsed.sessionIds : [];
      sessionIds.forEach((sessionId) => {
        const encoded = localStorage.getItem(getSessionStorageKey(sessionId));
        const decoded = decodeSession(encoded);
        if (decoded) {
          state.sessionsById[sessionId] = decoded;
        }
      });
    }
  } catch (error) {
    state.selectedPuzzle = "333";
    state.selectedSessionId = "";
    state.sessionsById = {};
    state.lastSource = "manuel";
    state.lastImportFileName = "";
    state.lastImportReport = null;
  }
}

function saveState() {
  const previousMetaRaw = localStorage.getItem(STORAGE_META_KEY);
  let previousSessionIds = [];
  try {
    const previousMeta = previousMetaRaw ? JSON.parse(previousMetaRaw) : null;
    previousSessionIds = Array.isArray(previousMeta?.sessionIds) ? previousMeta.sessionIds : [];
  } catch (error) {
    previousSessionIds = [];
  }

  const metaPayload = {
    selectedPuzzle: state.selectedPuzzle,
    selectedSessionId: state.selectedSessionId,
    lastSource: state.lastSource,
    lastImportFileName: state.lastImportFileName,
    lastImportReport: state.lastImportReport,
    version: 3,
    sessionIds: Object.keys(state.sessionsById),
  };

  try {
    localStorage.setItem(STORAGE_META_KEY, JSON.stringify(metaPayload));
    Object.entries(state.sessionsById).forEach(([sessionId, session]) => {
      localStorage.setItem(getSessionStorageKey(sessionId), encodeSession(session));
    });
    previousSessionIds
      .filter((sessionId) => !state.sessionsById[sessionId])
      .forEach((sessionId) => localStorage.removeItem(getSessionStorageKey(sessionId)));
  } catch (error) {
    if (isQuotaError(error)) {
      throw new Error(
        "localStorage saturé même en mode compact. Fais RESET TOUT puis réimporte uniquement les events WCA souhaités."
      );
    }
    throw error;
  }
}

function minifySolve(solve) {
  return {
    ms: Number(solve.ms) || 0,
    penalty: Number(solve.penalty) || 0,
    timestamp: Number(solve.timestamp) || Date.now(),
    source: solve.source || "",
  };
}

function ensureManualSessionForPuzzle(puzzleId) {
  const manualSessionId = `manual-${puzzleId}`;
  if (!state.sessionsById[manualSessionId]) {
    const puzzleLabel = WCA_PUZZLES.find((p) => p.id === puzzleId)?.label || puzzleId;
    state.sessionsById[manualSessionId] = {
      id: manualSessionId,
      name: `Manual ${puzzleLabel}`,
      puzzleId,
      rank: 100000,
      source: "manual",
      solves: [],
    };
  }
}

function encodeSession(session) {
  const header = `${session.id}|${session.puzzleId}|${String(session.name || "").replaceAll("\n", " ")}|${Number(session.rank) || 9999}|${
    session.source || ""
  }`;
  const lines = (session.solves || []).map(
    (solve) => `${Number(solve.ms) || 0}|${Number(solve.penalty) || 0}|${Number(solve.timestamp) || 0}`
  );
  return [header, ...lines].join("\n");
}

function decodeSession(encoded) {
  if (!encoded) {
    return null;
  }
  const lines = encoded.split("\n");
  if (lines.length === 0) {
    return null;
  }
  const [idRaw, puzzleIdRaw, nameRaw, rankRaw, sourceRaw] = lines[0].split("|");
  if (!idRaw || !puzzleIdRaw) {
    return null;
  }
  const solves = lines
    .slice(1)
    .map((line) => {
      const [msRaw, penaltyRaw, tsRaw] = line.split("|");
      const ms = Number(msRaw);
      const penalty = Number(penaltyRaw);
      const timestamp = Number(tsRaw);
      if (!Number.isFinite(ms) || !Number.isFinite(penalty) || !Number.isFinite(timestamp)) {
        return null;
      }
      return {
        ms,
        penalty,
        timestamp,
        source: sourceRaw || "local",
      };
    })
    .filter(Boolean);
  return {
    id: idRaw,
    puzzleId: puzzleIdRaw,
    name: nameRaw || idRaw,
    rank: Number(rankRaw) || 9999,
    source: sourceRaw || "local",
    solves,
  };
}

function getSessionStorageKey(sessionId) {
  return `${STORAGE_SESSION_PREFIX}${sessionId}`;
}

function estimateStorageKiB() {
  let chars = 0;
  const meta = localStorage.getItem(STORAGE_META_KEY) || "";
  chars += meta.length;
  Object.keys(state.sessionsById).forEach((sessionId) => {
    const value = localStorage.getItem(getSessionStorageKey(sessionId)) || encodeSession(state.sessionsById[sessionId]);
    chars += value.length;
  });
  return Math.round((chars * 2) / 1024);
}

function isQuotaError(error) {
  return error && (error.name === "QuotaExceededError" || error.code === 22);
}

function migrateFromV1IfNeeded() {
  const legacyRaw = localStorage.getItem("mini-cstimer-v1");
  if (!legacyRaw) {
    return;
  }
  try {
    const parsed = JSON.parse(legacyRaw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    state.selectedPuzzle =
      parsed.selectedPuzzle && WCA_PUZZLES.some((p) => p.id === parsed.selectedPuzzle) ? parsed.selectedPuzzle : "333";
    state.selectedSessionId = "";
    state.sessionsById = {};
    Object.entries(parsed.solvesByPuzzle || {}).forEach(([puzzleId, solves]) => {
      const sessionId = `legacy-${puzzleId}`;
      state.sessionsById[sessionId] = {
        id: sessionId,
        name: `Legacy ${puzzleId}`,
        puzzleId,
        rank: 50000,
        source: "legacy",
        solves: Array.isArray(solves) ? solves.map(minifySolve) : [],
      };
    });
    ensureManualSessionForPuzzle(state.selectedPuzzle);
    state.selectedSessionId = `manual-${state.selectedPuzzle}`;
    state.lastSource = "migration v1";
    state.lastImportFileName = "";
    state.lastImportReport = null;
    saveState();
    localStorage.removeItem("mini-cstimer-v1");
  } catch (error) {
    state.selectedPuzzle = "333";
    state.selectedSessionId = "";
    state.sessionsById = {};
    state.lastSource = "manuel";
    state.lastImportFileName = "";
    state.lastImportReport = null;
  }
}
