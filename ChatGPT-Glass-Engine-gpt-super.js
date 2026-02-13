// ==UserScript==
// @name         ChatGPT Glass Engine super
// @namespace    local.chatgpt.optimizer
// @version      1.2.11
// @description  玻璃态长对话引擎：虚拟滚动 + 红绿灯健康度 + 服务降级监控（状态/IP/PoW）+ 自动避让回复
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/palmcivetcn/chatgpt-vsGPT-SelfUsed/main/ChatGPT-Glass-Engine-gpt-super.js
// @updateURL    https://raw.githubusercontent.com/palmcivetcn/chatgpt-vsGPT-SelfUsed/main/ChatGPT-Glass-Engine-gpt-super.js
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @connect      chatgpt.com
// @connect      chat.openai.com
// @connect      status.openai.com
// @connect      scamalytics.com
// @connect      cloudflare.com
// @connect      www.cloudflare.com
// @connect      ipinfo.io
// @connect      uapis.cn
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @noframes
// ==/UserScript==
// Derived from https://github.com/3150214587/chatgpt-virtual-scrollGPT- (MIT License).

const __CGPT_BROWSER__ = typeof window !== 'undefined' && typeof document !== 'undefined';

function evaluateIdleGate({
  now = Date.now(),
  chatBusy = false,
  inputBusy = false,
  scrollBusy = false,
  deferSince = 0,
  maintenanceAt = 0,
  maxDeferMs = 0,
  maintenanceCooldownMs = 0
} = {}) {
  const chatBlocked = !!chatBusy;
  const inputBlocked = !!inputBusy;
  const scrollBlocked = !!scrollBusy;
  const blocked = chatBlocked || inputBlocked || scrollBlocked;

  let nextDeferSince = deferSince || 0;
  let nextMaintenanceAt = maintenanceAt || 0;

  let allowMaintenance = false;
  if (blocked) {
    if (!nextDeferSince) nextDeferSince = now;
  }
  else {
    const deferredFor = nextDeferSince ? (now - nextDeferSince) : 0;
    const cooldownOk = !nextMaintenanceAt || (now - nextMaintenanceAt >= maintenanceCooldownMs);
    if (nextDeferSince && deferredFor >= maxDeferMs && cooldownOk) {
      allowMaintenance = true;
      nextMaintenanceAt = now;
    }
    nextDeferSince = 0;
  }

  return {
    blocked,
    chatBlocked,
    inputBlocked,
    scrollBlocked,
    allowMaintenance,
    deferSince: nextDeferSince,
    maintenanceAt: nextMaintenanceAt
  };
}

function evaluatePauseReason({
  virtualizationEnabled = true,
  ctrlFFreeze = false,
  autoPauseOnChat = false,
  chatBusy = false,
  idleBlockedReason = ''
} = {}) {
  if (!virtualizationEnabled) return 'manual';
  if (ctrlFFreeze) return 'find';
  if (autoPauseOnChat && chatBusy) return 'chat';
  if (idleBlockedReason) return idleBlockedReason;
  return '';
}

function resolveUiRefreshDecision({
  now = Date.now(),
  force = false,
  open = false,
  busy = false,
  uiCacheAt = 0,
  lastUiFullAt = 0,
  sessionStartedAt = 0,
  initLightUiMs = 0,
  fullRefreshOpenMs = 0,
  fullRefreshClosedMs = 0,
  fullRefreshBusyMs = 0
} = {}) {
  const fullInterval = busy
    ? fullRefreshBusyMs
    : (open ? fullRefreshOpenMs : fullRefreshClosedMs);
  const doFull = !!force || !uiCacheAt || !lastUiFullAt || (now - lastUiFullAt) >= fullInterval;
  const initAge = now - sessionStartedAt;
  const lightInit = !force && !open && !uiCacheAt && initAge < initLightUiMs;
  return {
    fullInterval,
    doFull,
    lightInit
  };
}

function resolveWorstHealthLevel({
  virtualizationEnabled = true,
  memLevel = 'ok',
  domLevel = 'ok',
  degradedSeverity = 'ok'
} = {}) {
  let worst =
    (!virtualizationEnabled) ? 'off' :
    (memLevel === 'bad' || domLevel === 'bad') ? 'bad' :
    (memLevel === 'warn' || domLevel === 'warn') ? 'warn' :
    'ok';
  if (worst !== 'off') {
    if (degradedSeverity === 'bad') worst = 'bad';
    else if (degradedSeverity === 'warn' && worst === 'ok') worst = 'warn';
  }
  return worst;
}

function resolvePersistedRaw({
  gmValue = null,
  localValue = null
} = {}) {
  if (gmValue !== undefined && gmValue !== null) {
    return {
      value: gmValue,
      source: 'gm'
    };
  }
  if (localValue !== undefined && localValue !== null) {
    return {
      value: localValue,
      source: 'local'
    };
  }
  return {
    value: null,
    source: 'none'
  };
}

function resolveConversationRouteInfo({
  url = '',
  fallbackPath = '/'
} = {}) {
  let pathname = String(fallbackPath || '/');
  if (!pathname) pathname = '/';
  try {
    if (url) {
      const parsed = new URL(String(url), 'https://chatgpt.com');
      pathname = parsed.pathname || pathname;
    }
  }
  catch {}
  pathname = String(pathname || '/').trim() || '/';
  const match = pathname.match(/(?:^|\/)c\/([a-z0-9-]{8,})/i);
  const conversationId = match ? match[1] : '';
  const isConversation = !!conversationId;
  const routeKey = isConversation ? `c:${conversationId}` : pathname;
  return {
    pathname,
    conversationId,
    isConversation,
    routeKey
  };
}

function resolveRouteAutoScrollDecision({
  previousRouteKey = '',
  nextRouteKey = '',
  now = Date.now(),
  lastAutoScrollAt = 0,
  minIntervalMs = 800
} = {}) {
  const prev = String(previousRouteKey || '');
  const next = String(nextRouteKey || '');
  const changed = !!next && next !== prev;
  const throttled = !!lastAutoScrollAt && (now - lastAutoScrollAt) < Math.max(0, Number(minIntervalMs) || 0);
  return {
    changed,
    throttled,
    shouldAutoScroll: changed && !throttled,
    routeKey: next || prev
  };
}

function resolveLayerYieldMode({
  scope = 'dual',
  keepActive = false,
  genericActive = false
} = {}) {
  const normalized = String(scope || 'dual').trim().toLowerCase();
  const allowKeep = normalized === 'dual' || normalized === 'keep-only';
  const allowGeneric = normalized === 'dual' || normalized === 'generic-only';
  if (allowKeep && keepActive) return 'keep';
  if (allowGeneric && genericActive) return 'generic';
  return 'none';
}

function resolveLayerYieldZIndex({
  overlayZIndices = [],
  fallbackZIndex = 2900,
  minZIndex = 1
} = {}) {
  const minSafe = Math.max(1, Math.floor(Number(minZIndex) || 1));
  const fallbackRaw = Number(fallbackZIndex);
  const fallbackSafe = Math.max(minSafe, Number.isFinite(fallbackRaw) ? Math.floor(fallbackRaw) : minSafe);
  const list = Array.isArray(overlayZIndices) ? overlayZIndices : [];
  const values = [];
  list.forEach((item) => {
    const n = Number(item);
    if (Number.isFinite(n) && n > 0) values.push(Math.floor(n));
  });
  if (!values.length) return fallbackSafe;
  const top = Math.min(...values);
  if (!Number.isFinite(top)) return fallbackSafe;
  return Math.max(minSafe, top - 1);
}

function buildConversationExportMarkdown({
  title = '',
  url = '',
  exportedAtLocal = '',
  exportedAtIso = '',
  scriptVersion = '',
  turns = []
} = {}) {
  const safeTitle = String(title || 'ChatGPT Conversation').trim() || 'ChatGPT Conversation';
  const lines = [`# ${safeTitle}`, ''];
  if (url) lines.push(`- URL: ${String(url)}`);
  if (exportedAtLocal || exportedAtIso) {
    if (exportedAtLocal && exportedAtIso && exportedAtLocal !== exportedAtIso) {
      lines.push(`- Exported: ${exportedAtLocal} (${exportedAtIso})`);
    }
    else {
      lines.push(`- Exported: ${exportedAtLocal || exportedAtIso}`);
    }
  }
  if (scriptVersion) lines.push(`- ScriptVersion: ${String(scriptVersion)}`);
  const safeTurns = Array.isArray(turns) ? turns : [];
  lines.push(`- Turns: ${safeTurns.length}`);
  lines.push('');

  if (!safeTurns.length) {
    lines.push('_No conversation content captured._');
    return lines.join('\n').trimEnd();
  }

  safeTurns.forEach((turn, index) => {
    const roleRaw = String((turn && turn.role) || '').toLowerCase();
    const role = roleRaw === 'assistant'
      ? 'Assistant'
      : roleRaw === 'system'
        ? 'System'
        : 'User';
    const text = String((turn && turn.text) || '').trim();
    lines.push(`## ${index + 1}. ${role}`);
    lines.push('');
    lines.push(text || '_[empty]_');
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function resolveOptimizingStatus({
  virtualizationEnabled = true,
  ctrlFFreeze = false,
  autoPauseOnChat = true,
  chatBusy = false,
  gateReady = false,
  hardSliceActive = false,
  optimizeActive = false,
  lastWorkAt = 0,
  optimizeBusyUntil = 0,
  optimizeHoldMs = 420,
  now = Date.now()
} = {}) {
  const holdMs = Math.max(0, Number(optimizeHoldMs) || 0);
  const tsNow = Number.isFinite(now) ? now : Date.now();
  let nextBusyUntil = Number.isFinite(optimizeBusyUntil) ? optimizeBusyUntil : 0;

  if (!virtualizationEnabled || ctrlFFreeze || (autoPauseOnChat && chatBusy)) {
    return {
      optimizing: false,
      nextBusyUntil
    };
  }

  if (hardSliceActive || optimizeActive) {
    nextBusyUntil = Math.max(nextBusyUntil, tsNow + holdMs);
    return {
      optimizing: true,
      nextBusyUntil
    };
  }

  if (nextBusyUntil > tsNow) {
    return {
      optimizing: true,
      nextBusyUntil
    };
  }

  if (gateReady && lastWorkAt && (tsNow - lastWorkAt) < holdMs) {
    return {
      optimizing: true,
      nextBusyUntil: 0
    };
  }

  return {
    optimizing: false,
    nextBusyUntil: 0
  };
}

function buildStructuredLogExport({
  schemaVersion = '2.0.0',
  source = 'cgpt_glass_engine',
  component = 'userscript',
  generatedAtIso = '',
  generatedAtLocal = '',
  reason = '',
  session = {},
  conversation = {},
  health = {},
  runtime = {},
  bugFocus = {},
  events = []
} = {}) {
  const safeEvents = Array.isArray(events) ? events : [];
  return {
    schema: {
      name: 'cgpt_glass_log_export',
      version: String(schemaVersion || '2.0.0'),
      format: 'json',
      source: String(source || 'cgpt_glass_engine'),
      component: String(component || 'userscript')
    },
    meta: {
      generated_at_iso: String(generatedAtIso || new Date().toISOString()),
      generated_at_local: String(generatedAtLocal || ''),
      reason: String(reason || '')
    },
    session: session && typeof session === 'object' ? session : {},
    conversation: conversation && typeof conversation === 'object' ? conversation : {},
    health: health && typeof health === 'object' ? health : {},
    runtime: runtime && typeof runtime === 'object' ? runtime : {},
    bug_focus: bugFocus && typeof bugFocus === 'object' ? bugFocus : {},
    events: safeEvents
  };
}

function compactSingleLineText(value, maxLen = 120) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const limit = Number.isFinite(Number(maxLen)) ? Math.max(12, Math.floor(Number(maxLen))) : 120;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
}

function mapIncidentStatusLabel(status, lang = 'en') {
  const key = String(status || '').toLowerCase();
  if (lang === 'zh') {
    if (key === 'investigating') return '调查中';
    if (key === 'identified') return '已定位';
    if (key === 'monitoring') return '监控中';
    if (key === 'resolved') return '已恢复';
    if (key === 'postmortem') return '复盘中';
    return key || '未知';
  }
  if (key === 'investigating') return 'Investigating';
  if (key === 'identified') return 'Identified';
  if (key === 'monitoring') return 'Monitoring';
  if (key === 'resolved') return 'Resolved';
  if (key === 'postmortem') return 'Postmortem';
  return key || 'Unknown';
}

function summarizeStatusIncidents(incidents, {
  lang = 'en',
  maxItems = 2,
  maxNameLength = 76
} = {}) {
  const activeLang = lang === 'zh' ? 'zh' : 'en';
  const limit = Math.max(1, Math.min(4, Math.floor(Number(maxItems) || 2)));
  const nameLimit = Math.max(16, Math.floor(Number(maxNameLength) || 76));
  const list = Array.isArray(incidents) ? incidents : [];
  const unresolved = list.filter((item) => {
    const status = String(item?.status || '').toLowerCase();
    return status !== 'resolved';
  });

  const lines = unresolved.slice(0, limit).map((item, idx) => {
    const name = compactSingleLineText(item?.name, nameLimit) || (activeLang === 'zh' ? '官方事件' : 'Official incident');
    const statusLabel = mapIncidentStatusLabel(item?.status, activeLang);
    return `${idx + 1}. ${name}${statusLabel ? ` (${statusLabel})` : ''}`;
  });

  if (unresolved.length > limit) {
    const more = unresolved.length - limit;
    lines.push(activeLang === 'zh' ? `... 另有 ${more} 条` : `... ${more} more`);
  }

  return {
    count: unresolved.length,
    lines
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    evaluateIdleGate,
    evaluatePauseReason,
    resolveUiRefreshDecision,
    resolveWorstHealthLevel,
    resolvePersistedRaw,
    resolveConversationRouteInfo,
    resolveRouteAutoScrollDecision,
    resolveLayerYieldMode,
    resolveLayerYieldZIndex,
    buildConversationExportMarkdown,
    resolveOptimizingStatus,
    buildStructuredLogExport,
    compactSingleLineText,
    mapIncidentStatusLabel,
    summarizeStatusIncidents
  };
}

if (__CGPT_BROWSER__) {
(function () {
  'use strict';

  // region: Environment Guard & Session
  // ========================== 运行环境守护（避免与 KeepChatGPT IFRAME 冲突） ==========================
  const isTopFrame = (() => {
    try {
      return window.top === window.self;
    }
    catch {
      return false;
    }
  })();
  if (!isTopFrame) return;

  const ct = (document.contentType || '').toLowerCase();
  if (ct && !ct.includes('text/html')) return;

  const path = location.pathname || '';
  if (/^\/(api|auth|backend|v1|v2|_next|cdn-cgi)\b/i.test(path)) return;

  const PAGE_WIN = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (PAGE_WIN.__CGPT_GLASS_LOADED__ || PAGE_WIN.__CGPT_VS_LOADED__ || window.__CGPT_VS_LOADED__) return;
  PAGE_WIN.__CGPT_GLASS_LOADED__ = true;
  PAGE_WIN.__CGPT_VS_LOADED__ = true;
  window.__CGPT_VS_LOADED__ = true;
  const SESSION_STARTED_AT = Date.now();
  const SESSION_ID = (() => {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${SESSION_STARTED_AT.toString(36)}-${rand}`;
  })();
  // endregion: Environment Guard & Session


  // region: Tunables & Constants
  // ========================== 可调参数（一般不用动） ==========================
  const CHECK_INTERVAL_MS = 1500;
  const ROUTE_GUARD_MS = 1200;
  const ROUTE_AUTO_SCROLL_MIN_INTERVAL_MS = 900;
  const ROUTE_AUTO_SCROLL_DELAYS_MS = [80, 280, 760, 1500];
  const INPUT_DIM_IDLE_MS = 850;
  const INPUT_OPTIMIZE_GRACE_MS = 680;
  const IMAGE_LOAD_RETRY_MS = 250;
  const POS_FOLLOW_MS = 450;
  const POS_FOLLOW_WHEN_OPEN_MS = 250;
  const FLOAT_Y_OFFSET_PX = 0;
  const RESTORE_LAST_OPEN = false;
  const INIT_LIGHT_UI_MS = 1200;
  const INIT_VIRTUALIZE_DELAY_MS = 600;
  const SCRIPT_VERSION = '1.2.11';
  const VS_SLIM_CLASS = 'cgpt-vs-slim';
  const LAYER_COMPAT_SCOPE = 'dual';
  const LAYER_Z_NORMAL = 2147483647;
  const LAYER_Z_KEEP_FALLBACK = 2900;
  const LAYER_Z_GENERIC_FALLBACK = 3500;
  const LAYER_Z_MIN = 1;
  const LAYER_SYNC_MS = 300;
  const SUPPORTS_CV = (() => {
    try {
      return typeof CSS !== 'undefined' && CSS.supports && CSS.supports('content-visibility: auto');
    }
    catch {
      return false;
    }
  })();
  const DOM_COUNT_TTL_MS = 4000;
  const CHAT_BUSY_TTL_MS = 900;
  const CHAT_BUSY_MAX_SCAN = 80;
  const CHAT_BUSY_GRACE_MS = 2600;
  const SCROLL_ROOT_TTL_MS = 3200;
  const MARGIN_TTL_MS = 2400;
  const TURNS_COUNT_TTL_MS = 900;
  const MARGIN_TURN_STEPS = [80, 220, 360, 520];
  const MODEL_BTN_TTL_MS = 3000;
  const MODEL_CANDIDATE_MAX_SCORE = 1100;
  const FOLLOW_BOTTOM_ZONE_RATIO = 0.45;
  const FOLLOW_ANCHOR_GAP_PX = 8;
  const OPTIMIZE_HOLD_MS = 420;
  const HARD_SLICE_TURNS = 140;
  const HARD_SLICE_BUDGET_MIN_MS = 4;
  const HARD_SLICE_BUDGET_MAX_MS = 12;
  const HARD_SLICE_MIN_ITEMS = 10;
  const HARD_SLICE_MAX_ITEMS = 120;
  const HARD_SLICE_RESTART_RATIO = 0.6;
  const OPTIMIZE_IDLE_CLEAR_MS = 2000;
  const HARD_SCROLL_IDLE_MS = 160;
  const HARD_SCROLL_MAX_DEFER_MS = 1200;
  const SOFT_SYNC_DEBOUNCE_MS = 160;
  const SOFT_SYNC_CHAT_DEBOUNCE_MS = 520;
  const UI_FULL_REFRESH_OPEN_MS = 900;
  const UI_FULL_REFRESH_CLOSED_MS = 2600;
  const UI_FULL_REFRESH_BUSY_MS = 2000;
  const MOOD_ROTATE_MS = 28000;
  const MOOD_BALANCE_THRESHOLD_PX = 24;
  const MSG_CACHE_TTL_MS = 2600;
  const OPTIMIZE_PLAN_HOLD_MS = 12000;
  const OPTIMIZE_PRESSURE_MED = 0.6;
  const OPTIMIZE_PRESSURE_HIGH = 0.85;
  const OPTIMIZE_PRESSURE_CRITICAL = 1.05;
  const DEFAULT_PRESSURE_THRESHOLDS = {
    medium: OPTIMIZE_PRESSURE_MED,
    high: OPTIMIZE_PRESSURE_HIGH,
    critical: OPTIMIZE_PRESSURE_CRITICAL
  };
  const DEFAULT_OPTIMIZE_DELTA_BY_LEVEL = {
    low: 0,
    medium: 0,
    high: -1,
    critical: -2
  };
  const PRESSURE_LEVEL_ORDER = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  };

  const MODE_MARGIN_LIMITS = {
    performance: { minSoft: 1, minHard: 2, maxSoft: 2, maxHard: 4 },
    balanced: { minSoft: 1, minHard: 2, maxSoft: 3, maxHard: 6 },
    conservative: { minSoft: 2, minHard: 4, maxSoft: 4, maxHard: 8 }
  };

  // DP planner weights: higher "overscan" favors smaller margins (performance),
  // higher "change" favors stability (conservative).
  const MODE_PLAN_WEIGHTS = {
    performance: { soft: 3.2, hard: 2.4, change: 1.8, overscan: 2.2 },
    balanced: { soft: 2.4, hard: 2.2, change: 2.6, overscan: 1.4 },
    conservative: { soft: 1.8, hard: 1.6, change: 3.4, overscan: 0.6 }
  };

  const MODE_TO_SOFT_MARGIN_SCREENS = {
    performance: 1,
    balanced: 2,
    conservative: 3
  };

  const MODE_TO_HARD_MARGIN_SCREENS = {
    performance: 2,
    balanced: 4,
    conservative: 6
  };

  const MEM_STABLE_MB = 220;
  const MEM_WARNING_MB = 520;

  const DOM_OK = 7000;
  const DOM_WARN = 15000;

  // Auto optimize only after chat volume reaches a likely-lag threshold.
  const AUTO_OPTIMIZE_MIN_TURNS = MARGIN_TURN_STEPS[0];

  const AUTO_HARD_DOM_THRESHOLD = DOM_WARN;
  const AUTO_HARD_COOLDOWN_MS = 9000;
  const HARD_PASS_MIN_MS = 160;
  const AUTO_HARD_EXIT_DOM = DOM_OK;
  const AUTO_HARD_EXIT_MS = 4500;
  const AUTO_HARD_TURN_STEPS = [80, 160, 240, 320];
  const AUTO_HARD_TURN_FACTORS = [1.08, 1.0, 0.95, 0.9, 0.85];
  const MODE_OPTIMIZE_PROFILES = {
    performance: {
      pressure: { medium: 0.55, high: 0.8, critical: 0.98 },
      deltaByPressure: { low: 0, medium: -1, high: -2, critical: -3 },
      autoOptimizeMinTurns: 60,
      autoHardFactor: 0.85,
      autoHardExitFactor: 0.55,
      hardPressureLevel: 'medium',
      gatePressureLevel: 'medium'
    },
    balanced: {
      pressure: DEFAULT_PRESSURE_THRESHOLDS,
      deltaByPressure: DEFAULT_OPTIMIZE_DELTA_BY_LEVEL,
      autoOptimizeMinTurns: AUTO_OPTIMIZE_MIN_TURNS,
      autoHardFactor: 1.0,
      autoHardExitFactor: 0.6,
      hardPressureLevel: 'high',
      gatePressureLevel: 'high'
    },
    conservative: {
      pressure: { medium: 0.7, high: 0.98, critical: 1.15 },
      deltaByPressure: { low: 0, medium: 0, high: -1, critical: -1 },
      autoOptimizeMinTurns: 110,
      autoHardFactor: 1.12,
      autoHardExitFactor: 0.7,
      hardPressureLevel: 'critical',
      gatePressureLevel: 'critical'
    }
  };

  // ========================== 服务降级监控常量 ==========================
  const DEG_STATUS_REFRESH_MS = 2 * 60 * 1000;
  const DEG_IP_REFRESH_MS = 6 * 60 * 1000;
  const DEG_FETCH_MONITOR_FAST_MS = 1200;
  const DEG_FETCH_MONITOR_SLOW_MS = 7000;
  const DEG_STATUS_TTL_MS = 5 * 60 * 1000;
  const DEG_IP_TTL_MS = 12 * 60 * 1000;
  const DEG_POW_TTL_MS = 6 * 60 * 1000;
  const DEG_POW_PROBE_COOLDOWN_MS = 90 * 1000;
  const DEG_IP_COOLDOWN_MS = 12 * 1000;
  const DEG_REQ_TIMEOUT_MS = 5000;
  const DEG_CACHE_KEY = 'cgpt_glass_degraded_cache';
  const DEG_CACHE_VERSION = 1;
  const DEG_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const MOOD_API_URL = 'https://uapis.cn/api/v1/saying';
  const MOOD_CACHE_TEXT_KEY = 'cgpt_glass_mood_text';
  const MOOD_CACHE_DATE_KEY = 'cgpt_glass_mood_date';
  const MOOD_CACHE_SOURCE_KEY = 'cgpt_glass_mood_source';
  const MOOD_CACHE_ATTEMPT_KEY = 'cgpt_glass_mood_attempt';
  // endregion: Tunables & Constants

  // region: I18N & Labels
  const lang = 'zh';

  const I18N = {
    zh: {
      optimizeSoft: '优化',
      optimizeSoftTip: '自动优化：根据负载规划软/硬与屏数',
      optimizeStandby: '未达阈值，待优化',
      optimizeBelowThreshold: '未达阈值',
      optimizeReachedThreshold: '达到阈值',
      optimizeHard: '硬优化',
      optimizeHardTip: '硬虚拟化：远距内容替换为占位，显著降低 DOM',
      newChat: '新开对话',
      help: '帮助',
      health: '健康',
      autoPause: '回复避让',
      autoPauseTip: '回复生成时自动暂停优化，减少干扰与闪烁',
      scrollLatest: '回到底部',
      scrollLatestTip: '快速滚动到最新回复位置',
      sectionStatus: '状态总览',
      sectionRuntime: '运行控制',
      sectionOptimize: '优化操作',
      sectionStats: '性能面板',
      sectionMonitor: '降级监控',
      stateRunning: '运行中',
      statePaused: '暂停中',
      pauseByChat: '回复中',
      pauseByFind: '搜索中',
      pauseByManual: '手动暂停',
      monitor: '降级监控',
      monitorRefresh: '刷新监控',
      monitorRefreshTip: '刷新服务状态、IP质量与PoW难度',
      monitorService: '服务状态',
      monitorIp: 'IP 质量',
      monitorPow: 'PoW 难度',
      monitorUnknown: '未知',
      monitorPowWaiting: '等待触发',
      monitorPowTip: 'PoW 难度越低越顺滑（绿色最好）',
      monitorIpTip: 'IP 质量来自 Scamalytics 评分',
      monitorServiceTip: '来自 status.openai.com 的官方状态',
      monitorServiceSummary: '官方摘要',
      monitorServiceIssues: '当前问题',
      monitorServiceNoIssues: '当前无进行中的官方事件',
      monitorOpenStatus: '打开状态页',
      monitorCopyHistory: '点击复制历史',
      monitorCopyHint: '点击复制最近 10 条记录',
      monitorCopied: '已复制',
      monitorCopyFailed: '复制失败',
      chatExport: '导出对话',
      chatExportTip: '导出当前对话内容（md）',
      chatExported: '已导出',
      logExport: '导出日志',
      logExportTip: '下载诊断日志（json）',
      logExported: '已导出',
      moodTitle: '每日一言',
      moodTip: '点击换一句',
      moodSub: '给今天一点轻松感',
      riskVeryEasy: '非常容易',
      riskEasy: '容易',
      riskMedium: '中等',
      riskHard: '困难',
      riskCritical: '严重',
      riskUnknown: '未知'
    },
    en: {
      optimizeSoft: 'Optimize',
      optimizeSoftTip: 'Auto optimize: plan soft/hard and screen ranges by load',
      optimizeStandby: 'standby, below threshold',
      optimizeBelowThreshold: 'Below threshold',
      optimizeReachedThreshold: 'Threshold met',
      optimizeHard: 'Hard Optimize',
      optimizeHardTip: 'Hard mode: replace far content to reduce DOM',
      newChat: 'New chat',
      help: 'Help',
      health: 'Healthy',
      autoPause: 'Auto pause',
      autoPauseTip: 'Pause optimization while the assistant is replying',
      scrollLatest: 'Latest',
      scrollLatestTip: 'Jump to the latest reply',
      sectionStatus: 'Status Overview',
      sectionRuntime: 'Runtime Controls',
      sectionOptimize: 'Optimize Actions',
      sectionStats: 'Performance Stats',
      sectionMonitor: 'Degradation Monitor',
      stateRunning: 'Running',
      statePaused: 'Paused',
      pauseByChat: 'Replying',
      pauseByFind: 'Finding',
      pauseByManual: 'Manual pause',
      monitor: 'Monitor',
      monitorRefresh: 'Refresh',
      monitorRefreshTip: 'Refresh status, IP quality, and PoW difficulty',
      monitorService: 'Service',
      monitorIp: 'IP Quality',
      monitorPow: 'PoW Difficulty',
      monitorUnknown: 'Unknown',
      monitorPowWaiting: 'Waiting for trigger',
      monitorPowTip: 'Lower PoW difficulty is faster (green is best)',
      monitorIpTip: 'IP quality is based on Scamalytics fraud score',
      monitorServiceTip: 'Official status from status.openai.com',
      monitorServiceSummary: 'Official summary',
      monitorServiceIssues: 'Current incidents',
      monitorServiceNoIssues: 'No active official incidents',
      monitorOpenStatus: 'Open status page',
      monitorCopyHistory: 'Click to copy history',
      monitorCopyHint: 'Click to copy the most recent 10 records',
      monitorCopied: 'Copied',
      monitorCopyFailed: 'Copy failed',
      chatExport: 'Export Chat',
      chatExportTip: 'Export current conversation (md)',
      chatExported: 'Exported',
      logExport: 'Export Logs',
      logExportTip: 'Download diagnostic logs (json)',
      logExported: 'Exported',
      moodTitle: 'Mood',
      moodTip: 'Click to refresh',
      moodSub: 'A gentle line for you',
      riskVeryEasy: 'Very Easy',
      riskEasy: 'Easy',
      riskMedium: 'Medium',
      riskHard: 'Hard',
      riskCritical: 'Critical',
      riskUnknown: 'Unknown'
    }
  };

  function t(k) {
    return (I18N[lang] && I18N[lang][k]) ? I18N[lang][k] : k;
  }
  // endregion: I18N & Labels

  // region: Storage Keys & DOM IDs
  // ========================== 持久化 Key ==========================
  const KEY_MODE = 'cgpt_vs_mode';
  const KEY_ENABLED = 'cgpt_vs_enabled';
  const KEY_PINNED = 'cgpt_vs_pinned';
  const KEY_POS = 'cgpt_vs_pos';
  const KEY_LAST_OPEN = 'cgpt_vs_open';
  const KEY_CHAT_PAUSE = 'cgpt_vs_pause_on_chat';
  const KEY_IP_LOGS = 'cgpt_glass_ip_logs';

  // ========================== DOM IDs ==========================
  const STYLE_ID = 'cgpt-vs-style';
  const ROOT_ID = 'cgpt-vs-root';
  const DOT_ID = 'cgpt-vs-dot';
  const BTN_ID = 'cgpt-vs-btn';
  const STATUS_PILL_ID = 'cgpt-vs-statusPill';
  const PANEL_ID = 'cgpt-vs-panel';
  const STATUS_TEXT_ID = 'cgpt-vs-statusText';
  const STATUS_REASON_ID = 'cgpt-vs-statusReason';
  const TOP_TAGS_ID = 'cgpt-vs-topTags';
  const TOP_SVC_TAG_ID = 'cgpt-vs-topSvc';
  const TOP_IP_TAG_ID = 'cgpt-vs-topIp';
  const TOP_POW_TAG_ID = 'cgpt-vs-topPow';
  const TOP_PAUSE_TAG_ID = 'cgpt-vs-topPause';
  const TOP_OPT_TAG_ID = 'cgpt-vs-topOpt';
  const OPTIMIZE_BTN_ID = 'cgpt-vs-optimize';
  const HELP_ID = 'cgpt-vs-help';
  const AUTO_PAUSE_BTN_ID = 'cgpt-vs-autoPause';
  const SCROLL_LATEST_BTN_ID = 'cgpt-vs-scrollLatest';
  const CHAT_EXPORT_BTN_ID = 'cgpt-vs-chat-export';
  const LOG_EXPORT_BTN_ID = 'cgpt-vs-log-export';
  const DEG_SECTION_ID = 'cgpt-vs-degrade';
  const DEG_REFRESH_BTN_ID = 'cgpt-vs-deg-refresh';
  const DEG_SERVICE_DESC_ID = 'cgpt-vs-deg-service-desc';
  const DEG_SERVICE_TAG_ID = 'cgpt-vs-deg-service-tag';
  const DEG_IP_VALUE_ID = 'cgpt-vs-deg-ip';
  const DEG_IP_TAG_ID = 'cgpt-vs-deg-ip-tag';
  const DEG_IP_BADGE_ID = 'cgpt-vs-deg-ip-badge';
  const DEG_POW_VALUE_ID = 'cgpt-vs-deg-pow';
  const DEG_POW_TAG_ID = 'cgpt-vs-deg-pow-tag';
  const DEG_POW_BAR_ID = 'cgpt-vs-deg-pow-bar';
  const FETCH_WRAP_KEY = '__CGPT_GLASS_FETCH_WRAPPED__';
  const XHR_WRAP_KEY = '__CGPT_GLASS_XHR_WRAPPED__';
  const DEG_IP_CLICK_KEY = '__cgpt_glass_ip_click__';
  const MOOD_SECTION_ID = 'cgpt-vs-mood';
  const MOOD_TEXT_ID = 'cgpt-vs-mood-text';
  const MOOD_SUB_ID = 'cgpt-vs-mood-sub';

  // endregion: Storage Keys & DOM IDs

  // region: Runtime State
  // ========================== 状态 ==========================
  let currentMode = loadMode();
  let virtualizationEnabled = loadBool(KEY_ENABLED, true);
  let pinned = loadBool(KEY_PINNED, false);
  let wasOpen = RESTORE_LAST_OPEN ? loadBool(KEY_LAST_OPEN, false) : false;
  let autoPauseOnChat = loadBool(KEY_CHAT_PAUSE, true);
  let chatBusy = false;
  let chatBusyAt = 0;
  let chatBusySeenAt = 0;

  let ctrlFFreeze = false;
  let typingDimTimer = null;
  let lastInputAt = 0;
  let inputYieldUntil = 0;

  let rafPending = false;
  let lastVirtualizedCount = 0;
  let lastTurnsCount = 0;
  let virtualizeDeferred = false;
  let virtualizeDeferredTimer = 0;
  let pendingVirtualizeMargin = null;

  let followTimer = null;
  let docClickHandler = null;
  let themeObserver = null;
  let themeObservedBody = null;
  let pinnedPos = loadPos();
  let useSoftVirtualization = SUPPORTS_CV;
  let hardActive = false;
  let hardActiveSource = '';
  let autoHardBelowAt = 0;
  let lastHardPassAt = 0;
  let lastAutoHardAt = 0;
  let softSlimCount = 0;
  let softObserved = new Set();
  let softObserver = null;
  let softObserverMargin = '';
  let softObserverRoot = null;
  let softSyncTimer = null;
  let softSyncPending = false;
  let softSyncDeferred = false;
  let msgObserver = null;
  let msgContainer = null;
  let scrollRoot = null;
  let scrollRootAt = 0;
  let scrollTarget = window;
  let scrollRootIsWindow = true;
  let lastScrollAt = 0;
  let lastScrollTop = 0;
  let hardScrollDeferAt = 0;
  let hardScrollIdleTimer = 0;
  let lastRouteKey = '';
  let lastRouteAutoScrollAt = 0;
  let routeAutoScrollTimer = 0;
  let globalScrollHookInstalled = false;
  let msgCache = [];
  let msgCacheDirty = true;
  let msgCacheAt = 0;
  let domCountCache = 0;
  let domCountAt = 0;
  let turnsCountCache = 0;
  let turnsCountAt = 0;
  let optimizeBusyUntil = 0;
  let optimizeState = {
    active: false,
    lastWorkAt: 0
  };
  let optimizeGateReady = null;
  let lastUiFullAt = 0;
  let deferredFullUiScheduled = false;
  let uiCache = {
    at: 0,
    domNodes: 0,
    usedMB: null,
    turns: 0,
    plan: null
  };
  let uiRefs = null;
  let layerSyncObserver = null;
  let layerSyncTimer = 0;
  let layerSyncPending = false;
  let layerYieldMode = 'none';
  let layerYieldZIndex = LAYER_Z_NORMAL;
  let moodState = {
    index: -1,
    nextAt: 0,
    seed: 0,
    inFlight: false
  };
  let marginCache = {
    at: 0,
    soft: MODE_TO_SOFT_MARGIN_SCREENS[currentMode] ?? MODE_TO_SOFT_MARGIN_SCREENS.balanced,
    hard: MODE_TO_HARD_MARGIN_SCREENS[currentMode] ?? MODE_TO_HARD_MARGIN_SCREENS.balanced,
    turns: 0,
    mode: currentMode,
    overrideUntil: 0,
    overrideReason: ''
  };
  let modelBtnCache = {
    el: null,
    at: 0
  };

  // ========================== 服务降级监控状态 ==========================
  let degradedState = {
    service: {
      indicator: 'none',
      description: '',
      officialDescription: '',
      issueLines: [],
      issueCount: 0,
      color: '#10a37f',
      updatedAt: 0
    },
    ip: {
      masked: '--',
      full: '',
      warp: 'off',
      qualityLabel: '',
      qualityShort: '',
      qualityProbability: '',
      qualityColor: '#9ca3af',
      qualityScore: null,
      qualityTooltip: '',
      historyTooltip: '',
      updatedAt: 0,
      qualityAt: 0,
      qualityIp: '',
      inFlight: false,
      lastFetchAt: 0,
      error: ''
    },
    pow: {
      difficulty: '',
      levelLabel: '',
      levelKey: 'riskUnknown',
      color: '#9ca3af',
      percentage: 0,
      updatedAt: 0,
      lastProbeAt: 0
    },
    user: {
      type: '',
      paid: null
    }
  };
  let degradedTimers = {
    fetchMonitor: 0,
    status: 0,
    ip: 0
  };
  let degradedStarted = false;
  let hardSliceState = {
    active: false,
    token: 0,
    index: 0,
    total: 0,
    startAt: 0,
    scrollTop: 0,
    viewportH: 0,
    steps: 0,
    lastStepAt: 0
  };
  // endregion: Runtime State

  // region: Logging & Diagnostics
  // region: Pino (browser bundle)
  /* eslint-disable */
  /*
  * Pino v10.3.0 (MIT License)
  * The MIT License (MIT)
  * 
  * Copyright (c) 2016-2025 Matteo Collina, David Mark Clements and the Pino contributors listed at <https://github.com/pinojs/pino#the-team> and in the README file.
  * 
  * Permission is hereby granted, free of charge, to any person obtaining a copy
  * of this software and associated documentation files (the "Software"), to deal
  * in the Software without restriction, including without limitation the rights
  * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  * copies of the Software, and to permit persons to whom the Software is
  * furnished to do so, subject to the following conditions:
  * 
  * The above copyright notice and this permission notice shall be included in all
  * copies or substantial portions of the Software.
  * 
  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  * SOFTWARE.
  * 
  * 
  */
  const pino = (() => {
    'use strict';
    const format = (() => {
      function tryStringify (o) {
        try { return JSON.stringify(o) } catch(e) { return '"[Circular]"' }
      }

      function format(f, args, opts) {
        var ss = (opts && opts.stringify) || tryStringify
        var offset = 1
        if (typeof f === 'object' && f !== null) {
          var len = args.length + offset
          if (len === 1) return f
          var objects = new Array(len)
          objects[0] = ss(f)
          for (var index = 1; index < len; index++) {
            objects[index] = ss(args[index])
          }
          return objects.join(' ')
        }
        if (typeof f !== 'string') {
          return f
        }
        var argLen = args.length
        if (argLen === 0) return f
        var str = ''
        var a = 1 - offset
        var lastPos = -1
        var flen = (f && f.length) || 0
        for (var i = 0; i < flen;) {
          if (f.charCodeAt(i) === 37 && i + 1 < flen) {
            lastPos = lastPos > -1 ? lastPos : 0
            switch (f.charCodeAt(i + 1)) {
              case 100: // 'd'
              case 102: // 'f'
                if (a >= argLen)
                  break
                if (lastPos < i)
                  str += f.slice(lastPos, i)
                if (args[a] == null)  break
                str += Number(args[a])
                lastPos = i = i + 2
                break
              case 105: // 'i'
                if (a >= argLen)
                  break
                if (lastPos < i)
                  str += f.slice(lastPos, i)
                if (args[a] == null)  break
                str += Math.floor(Number(args[a]))
                lastPos = i = i + 2
                break
              case 79: // 'O'
              case 111: // 'o'
              case 106: // 'j'
                if (a >= argLen)
                  break
                if (lastPos < i)
                  str += f.slice(lastPos, i)
                if (args[a] === undefined) break
                var type = typeof args[a]
                if (type === 'string') {
                  str += '\'' + args[a] + '\''
                  lastPos = i + 2
                  i++
                  break
                }
                if (type === 'function') {
                  str += args[a].name || '<anonymous>'
                  lastPos = i + 2
                  i++
                  break
                }
                str += ss(args[a])
                lastPos = i + 2
                i++
                break
              case 115: // 's'
                if (a >= argLen)
                  break
                if (lastPos < i)
                  str += f.slice(lastPos, i)
                str += String(args[a])
                lastPos = i + 2
                i++
                break
              case 37: // '%'
                if (lastPos < i)
                  str += f.slice(lastPos, i)
                str += '%'
                lastPos = i + 2
                i++
                a--
                break
            }
            ++a
          }
          ++i
        }
        if (lastPos === -1)
          return f
        else if (lastPos < flen) {
          str += f.slice(lastPos)
        }

        return str
      }

      return format;
    })();

      const _console = pfGlobalThisOrFallback().console || {}
      const stdSerializers = {
        mapHttpRequest: mock,
        mapHttpResponse: mock,
        wrapRequestSerializer: passthrough,
        wrapResponseSerializer: passthrough,
        wrapErrorSerializer: passthrough,
        req: mock,
        res: mock,
        err: asErrValue,
        errWithCause: asErrValue
      }
      function levelToValue (level, logger) {
        return level === 'silent'
          ? Infinity
          : logger.levels.values[level]
      }
      const baseLogFunctionSymbol = Symbol('pino.logFuncs')
      const hierarchySymbol = Symbol('pino.hierarchy')

      const logFallbackMap = {
        error: 'log',
        fatal: 'error',
        warn: 'error',
        info: 'log',
        debug: 'log',
        trace: 'log'
      }

      function appendChildLogger (parentLogger, childLogger) {
        const newEntry = {
          logger: childLogger,
          parent: parentLogger[hierarchySymbol]
        }
        childLogger[hierarchySymbol] = newEntry
      }

      function setupBaseLogFunctions (logger, levels, proto) {
        const logFunctions = {}
        levels.forEach(level => {
          logFunctions[level] = proto[level] ? proto[level] : (_console[level] || _console[logFallbackMap[level] || 'log'] || noop)
        })
        logger[baseLogFunctionSymbol] = logFunctions
      }

      function shouldSerialize (serialize, serializers) {
        if (Array.isArray(serialize)) {
          const hasToFilter = serialize.filter(function (k) {
            return k !== '!stdSerializers.err'
          })
          return hasToFilter
        } else if (serialize === true) {
          return Object.keys(serializers)
        }

        return false
      }

      function pino (opts) {
        opts = opts || {}
        opts.browser = opts.browser || {}

        const transmit = opts.browser.transmit
        if (transmit && typeof transmit.send !== 'function') { throw Error('pino: transmit option must have a send function') }

        const proto = opts.browser.write || _console
        if (opts.browser.write) opts.browser.asObject = true
        const serializers = opts.serializers || {}
        const serialize = shouldSerialize(opts.browser.serialize, serializers)
        let stdErrSerialize = opts.browser.serialize

        if (
          Array.isArray(opts.browser.serialize) &&
          opts.browser.serialize.indexOf('!stdSerializers.err') > -1
        ) stdErrSerialize = false

        const customLevels = Object.keys(opts.customLevels || {})
        const levels = ['error', 'fatal', 'warn', 'info', 'debug', 'trace'].concat(customLevels)

        if (typeof proto === 'function') {
          levels.forEach(function (level) {
            proto[level] = proto
          })
        }
        if (opts.enabled === false || opts.browser.disabled) opts.level = 'silent'
        const level = opts.level || 'info'
        const logger = Object.create(proto)
        if (!logger.log) logger.log = noop

        setupBaseLogFunctions(logger, levels, proto)
        // setup root hierarchy entry
        appendChildLogger({}, logger)

        Object.defineProperty(logger, 'levelVal', {
          get: getLevelVal
        })
        Object.defineProperty(logger, 'level', {
          get: getLevel,
          set: setLevel
        })

        const setOpts = {
          transmit,
          serialize,
          asObject: opts.browser.asObject,
          asObjectBindingsOnly: opts.browser.asObjectBindingsOnly,
          formatters: opts.browser.formatters,
          reportCaller: opts.browser.reportCaller,
          levels,
          timestamp: getTimeFunction(opts),
          messageKey: opts.messageKey || 'msg',
          onChild: opts.onChild || noop
        }
        logger.levels = getLevels(opts)
        logger.level = level

        logger.isLevelEnabled = function (level) {
          if (!this.levels.values[level]) {
            return false
          }

          return this.levels.values[level] >= this.levels.values[this.level]
        }
        logger.setMaxListeners = logger.getMaxListeners =
        logger.emit = logger.addListener = logger.on =
        logger.prependListener = logger.once =
        logger.prependOnceListener = logger.removeListener =
        logger.removeAllListeners = logger.listeners =
        logger.listenerCount = logger.eventNames =
        logger.write = logger.flush = noop
        logger.serializers = serializers
        logger._serialize = serialize
        logger._stdErrSerialize = stdErrSerialize
        logger.child = function (...args) { return child.call(this, setOpts, ...args) }

        if (transmit) logger._logEvent = createLogEventShape()

        function getLevelVal () {
          return levelToValue(this.level, this)
        }

        function getLevel () {
          return this._level
        }
        function setLevel (level) {
          if (level !== 'silent' && !this.levels.values[level]) {
            throw Error('unknown level ' + level)
          }
          this._level = level

          set(this, setOpts, logger, 'error') // <-- must stay first
          set(this, setOpts, logger, 'fatal')
          set(this, setOpts, logger, 'warn')
          set(this, setOpts, logger, 'info')
          set(this, setOpts, logger, 'debug')
          set(this, setOpts, logger, 'trace')

          customLevels.forEach((level) => {
            set(this, setOpts, logger, level)
          })
        }

        function child (setOpts, bindings, childOptions) {
          if (!bindings) {
            throw new Error('missing bindings for child Pino')
          }
          childOptions = childOptions || {}
          if (serialize && bindings.serializers) {
            childOptions.serializers = bindings.serializers
          }
          const childOptionsSerializers = childOptions.serializers
          if (serialize && childOptionsSerializers) {
            var childSerializers = Object.assign({}, serializers, childOptionsSerializers)
            var childSerialize = opts.browser.serialize === true
              ? Object.keys(childSerializers)
              : serialize
            delete bindings.serializers
            applySerializers([bindings], childSerialize, childSerializers, this._stdErrSerialize)
          }
          function Child (parent) {
            this._childLevel = (parent._childLevel | 0) + 1

            // make sure bindings are available in the `set` function
            this.bindings = bindings

            if (childSerializers) {
              this.serializers = childSerializers
              this._serialize = childSerialize
            }
            if (transmit) {
              this._logEvent = createLogEventShape(
                [].concat(parent._logEvent.bindings, bindings)
              )
            }
          }
          Child.prototype = this
          const newLogger = new Child(this)

          // must happen before the level is assigned
          appendChildLogger(this, newLogger)
          newLogger.child = function (...args) { return child.call(this, setOpts, ...args) }
          // required to actually initialize the logger functions for any given child
          newLogger.level = childOptions.level || this.level // allow level to be set by childOptions
          setOpts.onChild(newLogger)

          return newLogger
        }
        return logger
      }

      function getLevels (opts) {
        const customLevels = opts.customLevels || {}

        const values = Object.assign({}, pino.levels.values, customLevels)
        const labels = Object.assign({}, pino.levels.labels, invertObject(customLevels))

        return {
          values,
          labels
        }
      }

      function invertObject (obj) {
        const inverted = {}
        Object.keys(obj).forEach(function (key) {
          inverted[obj[key]] = key
        })
        return inverted
      }

      pino.levels = {
        values: {
          fatal: 60,
          error: 50,
          warn: 40,
          info: 30,
          debug: 20,
          trace: 10
        },
        labels: {
          10: 'trace',
          20: 'debug',
          30: 'info',
          40: 'warn',
          50: 'error',
          60: 'fatal'
        }
      }

      pino.stdSerializers = stdSerializers
      pino.stdTimeFunctions = Object.assign({}, { nullTime, epochTime, unixTime, isoTime })

      function getBindingChain (logger) {
        const bindings = []
        if (logger.bindings) {
          bindings.push(logger.bindings)
        }

        // traverse up the tree to get all bindings
        let hierarchy = logger[hierarchySymbol]
        while (hierarchy.parent) {
          hierarchy = hierarchy.parent
          if (hierarchy.logger.bindings) {
            bindings.push(hierarchy.logger.bindings)
          }
        }

        return bindings.reverse()
      }

      function set (self, opts, rootLogger, level) {
        // override the current log functions with either `noop` or the base log function
        Object.defineProperty(self, level, {
          value: (levelToValue(self.level, rootLogger) > levelToValue(level, rootLogger)
            ? noop
            : rootLogger[baseLogFunctionSymbol][level]),
          writable: true,
          enumerable: true,
          configurable: true
        })

        if (self[level] === noop) {
          if (!opts.transmit) return

          const transmitLevel = opts.transmit.level || self.level
          const transmitValue = levelToValue(transmitLevel, rootLogger)
          const methodValue = levelToValue(level, rootLogger)
          if (methodValue < transmitValue) return
        }

        // make sure the log format is correct
        self[level] = createWrap(self, opts, rootLogger, level)

        // prepend bindings if it is not the root logger
        const bindings = getBindingChain(self)
        if (bindings.length === 0) {
          // early exit in case for rootLogger
          return
        }
        self[level] = prependBindingsInArguments(bindings, self[level])
      }

      function prependBindingsInArguments (bindings, logFunc) {
        return function () {
          return logFunc.apply(this, [...bindings, ...arguments])
        }
      }

      function createWrap (self, opts, rootLogger, level) {
        return (function (write) {
          return function LOG () {
            const ts = opts.timestamp()
            const args = new Array(arguments.length)
            const proto = (Object.getPrototypeOf && Object.getPrototypeOf(this) === _console) ? _console : this
            for (var i = 0; i < args.length; i++) args[i] = arguments[i]

            var argsIsSerialized = false
            if (opts.serialize) {
              applySerializers(args, this._serialize, this.serializers, this._stdErrSerialize)
              argsIsSerialized = true
            }
            if (opts.asObject || opts.formatters) {
              const out = asObject(this, level, args, ts, opts)
              if (opts.reportCaller && out && out.length > 0 && out[0] && typeof out[0] === 'object') {
                try {
                  const caller = getCallerLocation()
                  if (caller) out[0].caller = caller
                } catch (e) {}
              }
              write.call(proto, ...out)
            } else {
              if (opts.reportCaller) {
                try {
                  const caller = getCallerLocation()
                  if (caller) args.push(caller)
                } catch (e) {}
              }
              write.apply(proto, args)
            }

            if (opts.transmit) {
              const transmitLevel = opts.transmit.level || self._level
              const transmitValue = levelToValue(transmitLevel, rootLogger)
              const methodValue = levelToValue(level, rootLogger)
              if (methodValue < transmitValue) return
              transmit(this, {
                ts,
                methodLevel: level,
                methodValue,
                transmitLevel,
                transmitValue: rootLogger.levels.values[opts.transmit.level || self._level],
                send: opts.transmit.send,
                val: levelToValue(self._level, rootLogger)
              }, args, argsIsSerialized)
            }
          }
        })(self[baseLogFunctionSymbol][level])
      }

      function asObject (logger, level, args, ts, opts) {
        const {
          level: levelFormatter,
          log: logObjectFormatter = (obj) => obj
        } = opts.formatters || {}
        const argsCloned = args.slice()
        let msg = argsCloned[0]
        const logObject = {}

        let lvl = (logger._childLevel | 0) + 1
        if (lvl < 1) lvl = 1

        if (ts) {
          logObject.time = ts
        }

        if (levelFormatter) {
          const formattedLevel = levelFormatter(level, logger.levels.values[level])
          Object.assign(logObject, formattedLevel)
        } else {
          logObject.level = logger.levels.values[level]
        }

        if (opts.asObjectBindingsOnly) {
          if (msg !== null && typeof msg === 'object') {
            while (lvl-- && typeof argsCloned[0] === 'object') {
              Object.assign(logObject, argsCloned.shift())
            }
          }

          const formattedLogObject = logObjectFormatter(logObject)
          return [formattedLogObject, ...argsCloned]
        } else {
          // deliberate, catching objects, arrays
          if (msg !== null && typeof msg === 'object') {
            while (lvl-- && typeof argsCloned[0] === 'object') {
              Object.assign(logObject, argsCloned.shift())
            }
            msg = argsCloned.length ? format(argsCloned.shift(), argsCloned) : undefined
          } else if (typeof msg === 'string') msg = format(argsCloned.shift(), argsCloned)
          if (msg !== undefined) logObject[opts.messageKey] = msg

          const formattedLogObject = logObjectFormatter(logObject)
          return [formattedLogObject]
        }
      }

      function applySerializers (args, serialize, serializers, stdErrSerialize) {
        for (const i in args) {
          if (stdErrSerialize && args[i] instanceof Error) {
            args[i] = pino.stdSerializers.err(args[i])
          } else if (typeof args[i] === 'object' && !Array.isArray(args[i]) && serialize) {
            for (const k in args[i]) {
              if (serialize.indexOf(k) > -1 && k in serializers) {
                args[i][k] = serializers[k](args[i][k])
              }
            }
          }
        }
      }

      function transmit (logger, opts, args, argsIsSerialized = false) {
        const send = opts.send
        const ts = opts.ts
        const methodLevel = opts.methodLevel
        const methodValue = opts.methodValue
        const val = opts.val
        const bindings = logger._logEvent.bindings

        if (!argsIsSerialized) {
          applySerializers(
            args,
            logger._serialize || Object.keys(logger.serializers),
            logger.serializers,
            logger._stdErrSerialize === undefined ? true : logger._stdErrSerialize
          )
        }

        logger._logEvent.ts = ts
        logger._logEvent.messages = args.filter(function (arg) {
          // bindings can only be objects, so reference equality check via indexOf is fine
          return bindings.indexOf(arg) === -1
        })

        logger._logEvent.level.label = methodLevel
        logger._logEvent.level.value = methodValue

        send(methodLevel, logger._logEvent, val)

        logger._logEvent = createLogEventShape(bindings)
      }

      function createLogEventShape (bindings) {
        return {
          ts: 0,
          messages: [],
          bindings: bindings || [],
          level: { label: '', value: 0 }
        }
      }

      function asErrValue (err) {
        const obj = {
          type: err.constructor.name,
          msg: err.message,
          stack: err.stack
        }
        for (const key in err) {
          if (obj[key] === undefined) {
            obj[key] = err[key]
          }
        }
        return obj
      }

      function getTimeFunction (opts) {
        if (typeof opts.timestamp === 'function') {
          return opts.timestamp
        }
        if (opts.timestamp === false) {
          return nullTime
        }
        return epochTime
      }

      function mock () { return {} }
      function passthrough (a) { return a }
      function noop () {}

      function nullTime () { return false }
      function epochTime () { return Date.now() }
      function unixTime () { return Math.round(Date.now() / 1000.0) }
      function isoTime () { return new Date(Date.now()).toISOString() } // using Date.now() for testability

      /* eslint-disable */
      /* istanbul ignore next */
      function pfGlobalThisOrFallback () {
        function defd (o) { return typeof o !== 'undefined' && o }
        try {
          if (typeof globalThis !== 'undefined') return globalThis
          Object.defineProperty(Object.prototype, 'globalThis', {
            get: function () {
              delete Object.prototype.globalThis
              return (this.globalThis = this)
            },
            configurable: true
          })
          return globalThis
        } catch (e) {
          return defd(self) || defd(window) || defd(this) || {}
        }
      }
      /* eslint-enable */

      if (typeof module !== 'undefined' && module && module.exports) {
        module.exports.default = pino
        module.exports.pino = pino
      }

      // Attempt to extract the user callsite (file:line:column)
      /* istanbul ignore next */
      function getCallerLocation () {
        const stack = (new Error()).stack
        if (!stack) return null
        const lines = stack.split('\n')
        for (let i = 1; i < lines.length; i++) {
          const l = lines[i].trim()
          // skip frames from this file and internals
          if (/(^at\s+)?(createWrap|LOG|set\s*\(|asObject|Object\.apply|Function\.apply)/.test(l)) continue
          if (l.indexOf('browser.js') !== -1) continue
          if (l.indexOf('node:internal') !== -1) continue
          if (l.indexOf('node_modules') !== -1) continue
          // try formats like: at func (file:line:col) or at file:line:col
          let m = l.match(/\((.*?):(\d+):(\d+)\)/)
          if (!m) m = l.match(/at\s+(.*?):(\d+):(\d+)/)
          if (m) {
            const file = m[1]
            const line = m[2]
            const col = m[3]
            return file + ':' + line + ':' + col
          }
        }
        return null
      }

    return pino;
  })();
  /* eslint-enable */
  // endregion: Pino (browser bundle)

  // ========================== 诊断日志（控制台输出） ==========================
  const LOG_KEY = 'cgpt_vs_log_level';
  const LOG_CONSOLE_KEY = 'cgpt_vs_log_console';
  const LOG_ENV_KEY = 'cgpt_vs_log_env';
  const LOG_BUFFER_MAX = 600;
  const LOG_VIRT_THROTTLE_MS = 3500;
  const LOG_HEALTH_THROTTLE_MS = 6000;
  const LOG_SCHEMA_VERSION = '1.1';
  const LOG_SOURCE = 'cgpt_glass_engine';
  const LOG_COMPONENT = 'userscript';
  // Note: In Node/server environments, prefer Winston/Pino/Bunyan for structured logs.
  const LOG_FIELD_ORDER = [
    'timestamp',
    'level',
    'message',
    'context',
    'severity',
    'event',
    'event_id',
    'category',
    'outcome',
    'source',
    'component',
    'session_id',
    'version',
    'seq'
  ];
  const LOG_EVENT_CATEGORY = {
    degraded: 'degradation',
    virtualize: 'virtualization',
    soft: 'virtualization',
    hard: 'virtualization',
    optimize: 'virtualization',
    health: 'health',
    ui: 'ui',
    route: 'routing',
    resize: 'ui',
    boot: 'lifecycle',
    chat: 'interaction',
    ctrlF: 'interaction',
    log: 'logging',
    window: 'runtime'
  };
  const LOG_OUTCOME_FAIL_RE = /(?:^|[._-])(fail|error|timeout|reject|denied|invalid)(?:$|[._-])/i;
  const SENSITIVE_KEY_RE = /pass(word)?|token|secret|authorization|cookie|session|bearer|api[-_]?key/i;
  const IP_KEY_RE = /\bip\b/i;

  const LOG_LEVELS = {
    off: 0,
    info: 1,
    warn: 1,
    error: 1,
    debug: 2
  };

  const LOG_ENV = (() => {
    try {
      const raw = localStorage.getItem(LOG_ENV_KEY);
      if (raw === 'dev' || raw === 'prod') return raw;
    }
    catch {}
    return 'prod';
  })();
  const IS_PROD = LOG_ENV === 'prod';

  let logLevel = localStorage.getItem(LOG_KEY) || 'info';
  if (!LOG_LEVELS[logLevel]) logLevel = 'info';
  if (IS_PROD && logLevel === 'debug') logLevel = 'info';
  let logToConsole = localStorage.getItem(LOG_CONSOLE_KEY);
  if (logToConsole == null) logToConsole = '0';
  logToConsole = logToConsole === '1';

  const logBuffer = [];
  let logSeq = 0;
  let lastVirtSig = '';
  let lastVirtLogAt = 0;
  let lastHealthSig = '';
  let lastHealthLogAt = 0;

  function canLog(level) {
    if (IS_PROD && level === 'debug') return false;
    const target = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    const current = LOG_LEVELS[logLevel] ?? LOG_LEVELS.info;
    return target <= current;
  }

  function markMarginCacheDirty() {
    marginCache.at = 0;
  }

  function markMsgCacheDirty() {
    msgCacheDirty = true;
    msgCacheAt = 0;
    turnsCountAt = 0;
    markMarginCacheDirty();
  }

  function reclaimRuntimeCaches(reason, options) {
    const opts = options || {};
    if (opts.releaseNodeRefs) {
      msgCache = [];
      turnsCountCache = 0;
      lastTurnsCount = 0;
      domCountAt = 0;
      domCountCache = 0;
    }
    msgCacheDirty = true;
    msgCacheAt = 0;
    turnsCountAt = 0;

    if (opts.resetSoftObservers) {
      if (softObserver) {
        softObserver.disconnect();
        softObserver = null;
      }
      softObserved = new Set();
      softSlimCount = 0;
      softObserverMargin = '';
      softObserverRoot = null;
      if (softSyncTimer) clearTimeout(softSyncTimer);
      softSyncTimer = 0;
      softSyncPending = false;
      softSyncDeferred = false;
    }

    if (opts.resetMsgObserver) {
      if (msgObserver) {
        msgObserver.disconnect();
        msgObserver = null;
      }
      msgContainer = null;
    }

    if (reason) {
      logEvent('debug', 'cache.reclaim', {
        reason,
        releaseNodeRefs: !!opts.releaseNodeRefs,
        resetSoftObservers: !!opts.resetSoftObservers,
        resetMsgObserver: !!opts.resetMsgObserver
      });
    }
  }

  function getDomNodeCount() {
    const now = Date.now();
    if (!domCountAt || (now - domCountAt) > DOM_COUNT_TTL_MS) {
      domCountCache = document.getElementsByTagName('*').length;
      domCountAt = now;
    }
    return domCountCache;
  }

  function getTurnsCountCached(force) {
    const now = Date.now();
    if (!force && turnsCountAt && (now - turnsCountAt) < TURNS_COUNT_TTL_MS && turnsCountCache) {
      return turnsCountCache;
    }
    const nodes = getMessageNodes();
    const count = nodes ? nodes.length : 0;
    turnsCountCache = count;
    turnsCountAt = now;
    return count;
  }

  function isScrollable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const style = getComputedStyle(el);
    const overflowY = style.overflowY || style.overflow;
    if (!overflowY || (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay')) return false;
    return (el.scrollHeight - el.clientHeight) > 24;
  }

  function resolveScrollRoot() {
    const now = Date.now();
    if (scrollRoot && (now - scrollRootAt) < SCROLL_ROOT_TTL_MS) return scrollRoot;
    scrollRootAt = now;
    let base = msgContainer || findMessageContainer();
    let el = base;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isScrollable(el)) {
        scrollRoot = el;
        return scrollRoot;
      }
      el = el.parentElement;
    }
    scrollRoot = document.scrollingElement || document.documentElement || document.body;
    return scrollRoot;
  }

  function getScrollMetrics() {
    const root = resolveScrollRoot();
    const isWindowRoot = !root ||
      root === document.scrollingElement ||
      root === document.documentElement ||
      root === document.body;
    scrollRootIsWindow = isWindowRoot;
    return {
      root,
      isWindow: isWindowRoot,
      top: isWindowRoot ? Math.round(window.scrollY) : Math.round(root.scrollTop || 0),
      height: isWindowRoot ? Math.round(window.innerHeight) : Math.round(root.clientHeight || 0)
    };
  }

  function handleScroll(e) {
    const target = e?.target;
    if (target && target !== document && target !== document.documentElement && target !== document.body && target.nodeType === 1) {
      if (scrollRoot !== target) scrollRoot = target;
      scrollRootAt = Date.now();
      scrollRootIsWindow = false;
      if (scrollTarget !== target) {
        if (scrollTarget) scrollTarget.removeEventListener('scroll', handleScroll, {
          passive: true
        });
        scrollTarget = target;
        scrollTarget.addEventListener('scroll', handleScroll, {
          passive: true
        });
      }
    }
    else if (target) {
      scrollRoot = document.scrollingElement || document.documentElement || document.body;
      scrollRootAt = Date.now();
      scrollRootIsWindow = true;
      if (scrollTarget !== window) {
        if (scrollTarget) scrollTarget.removeEventListener('scroll', handleScroll, {
          passive: true
        });
        scrollTarget = window;
        scrollTarget.addEventListener('scroll', handleScroll, {
          passive: true
        });
      }
    }
    const scrollInfo = getScrollMetrics();
    lastScrollAt = Date.now();
    lastScrollTop = scrollInfo.top;
    scheduleVirtualize();
  }

  function installGlobalScrollHook() {
    if (globalScrollHookInstalled) return;
    globalScrollHookInstalled = true;
    document.addEventListener('scroll', handleScroll, {
      capture: true,
      passive: true
    });
  }

  function installScrollHook() {
    installGlobalScrollHook();
    const info = getScrollMetrics();
    const target = info.isWindow ? window : info.root;
    if (scrollTarget === target) return;
    if (scrollTarget) scrollTarget.removeEventListener('scroll', handleScroll, {
      passive: true
    });
    scrollTarget = target;
    scrollRoot = info.root;
    scrollRootIsWindow = info.isWindow;
    if (scrollTarget) scrollTarget.addEventListener('scroll', handleScroll, {
      passive: true
    });
  }

  function isChatBusy() {
    const fastHit = document.querySelector(
      'button[aria-label*="Stop"], button[aria-label*="停止"], button[title*="Stop"], button[title*="停止"], button[aria-label*="Stop generating"], button[aria-label*="停止生成"], [data-testid="stop-generating"], [data-testid*="stop"]'
    );
    if (fastHit) return true;

    const streamingHit = document.querySelector(
      '.result-streaming, [data-message-author-role="assistant"][data-streaming="true"], [data-message-author-role="assistant"][data-is-streaming="true"], [data-testid="message-streaming"], [data-message-status="in_progress"], [data-message-status="streaming"], [data-message-status="pending"], [data-message-status="running"], [data-message-status="incomplete"]'
    );
    if (streamingHit) return true;

    const btns = document.querySelectorAll('button, [role="button"]');
    const limit = Math.min(btns.length, CHAT_BUSY_MAX_SCAN);
    for (let i = 0; i < limit; i += 1) {
      const b = btns[i];
      const label = (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
      const text = ((b.textContent || '')).trim();
      const txt = label || text;
      if (!txt) continue;
      if (
        txt === 'Stop' ||
        txt === '停止' ||
        txt.includes('Stop generating') ||
        txt.includes('停止生成') ||
        txt.includes('停止回复') ||
        txt.includes('停止回答')
      ) return true;
    }
    return false;
  }

  function updateChatBusy(force) {
    if (!autoPauseOnChat) {
      chatBusy = false;
      chatBusySeenAt = 0;
      return false;
    }
    const now = Date.now();
    if (!force && (now - chatBusyAt) < CHAT_BUSY_TTL_MS) return chatBusy;
    const prev = chatBusy;
    const busyNow = isChatBusy();
    if (busyNow) chatBusySeenAt = now;
    if (prev && !chatBusySeenAt) chatBusySeenAt = now;
    const keepBusy = busyNow || (prev && (now - chatBusySeenAt) < CHAT_BUSY_GRACE_MS);
    chatBusy = keepBusy;
    chatBusyAt = now;
    if (chatBusy !== prev) {
      logEvent('info', chatBusy ? 'chat.pause' : 'chat.resume', {
        autoPauseOnChat: !!autoPauseOnChat
      });
      if (!chatBusy) {
        if (softSyncDeferred) {
          softSyncDeferred = false;
          scheduleSoftSync('chat.resume');
        }
        if (virtualizeDeferred) {
          virtualizeDeferred = false;
          const pending = pendingVirtualizeMargin;
          pendingVirtualizeMargin = null;
          scheduleVirtualize(pending);
        }
        else {
          scheduleVirtualize();
        }
      }
    }
    return chatBusy;
  }

  function markInputYield(durationMs) {
    const now = Date.now();
    const duration = Number.isFinite(durationMs) ? durationMs : INPUT_OPTIMIZE_GRACE_MS;
    const next = now + Math.max(0, duration);
    if (next > inputYieldUntil) inputYieldUntil = next;
  }

  function shouldYieldToInput(now) {
    const t = Number.isFinite(now) ? now : Date.now();
    return !!inputYieldUntil && t < inputYieldUntil;
  }

  function scheduleDeferredVirtualize(delayMs) {
    if (virtualizeDeferredTimer) return;
    const delay = Math.max(60, Math.min(1200, Number(delayMs) || INPUT_OPTIMIZE_GRACE_MS));
    virtualizeDeferredTimer = setTimeout(() => {
      virtualizeDeferredTimer = 0;
      if (autoPauseOnChat && chatBusy) return;
      const now = Date.now();
      if (shouldYieldToInput(now)) {
        scheduleDeferredVirtualize((inputYieldUntil - now) + 20);
        return;
      }
      const pending = pendingVirtualizeMargin;
      pendingVirtualizeMargin = null;
      virtualizeDeferred = false;
      scheduleVirtualize(pending);
    }, delay);
  }

  function setOptimizeActive(active) {
    optimizeState.active = !!active;
    if (optimizeState.active) optimizeState.lastWorkAt = Date.now();
  }

  function markOptimizeWork() {
    optimizeState.lastWorkAt = Date.now();
  }

  function isOptimizingNow() {
    if (!virtualizationEnabled || ctrlFFreeze || (autoPauseOnChat && chatBusy)) return false;
    const now = Date.now();
    if (hardSliceState.active && hardSliceState.lastStepAt && (now - hardSliceState.lastStepAt) > OPTIMIZE_IDLE_CLEAR_MS) {
      hardSliceState.active = false;
      optimizeState.active = false;
    }
    const turns = getTurnsCountCached(false) || lastTurnsCount || 0;
    const gate = getOptimizeGateStatus(now, turns, getDomNodeCount(), getUsedHeapMB());
    const status = resolveOptimizingStatus({
      virtualizationEnabled,
      ctrlFFreeze,
      autoPauseOnChat,
      chatBusy,
      gateReady: !!gate.ready,
      hardSliceActive: !!hardSliceState.active,
      optimizeActive: !!optimizeState.active,
      lastWorkAt: optimizeState.lastWorkAt,
      optimizeBusyUntil,
      optimizeHoldMs: OPTIMIZE_HOLD_MS,
      now
    });
    optimizeBusyUntil = status.nextBusyUntil;
    return !!status.optimizing;
  }

  function pushLog(entry) {
    logBuffer.push(entry);
    if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  }

  function hashString32(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return (hash >>> 0).toString(36);
  }

  function getEventId(eventName) {
    const name = String(eventName || '').trim();
    if (!name) return 'evt_0';
    return `evt_${hashString32(name)}`;
  }

  function getEventCategory(eventName) {
    const head = String(eventName || '').split('.')[0];
    return LOG_EVENT_CATEGORY[head] || 'system';
  }

  function getEventOutcome(eventName, data, level) {
    if (data && typeof data.success === 'boolean') return data.success ? 'success' : 'failure';
    const name = String(eventName || '').toLowerCase();
    if (LOG_OUTCOME_FAIL_RE.test(name)) return 'failure';
    if (level === 'error') return 'failure';
    if (level === 'warn') return 'unknown';
    return 'success';
  }

  function getEventSeverity(level) {
    if (level === 'error') return 'high';
    if (level === 'warn') return 'medium';
    if (level === 'info') return 'low';
    return 'low';
  }

  function sanitizeContext(value) {
    const seen = new WeakSet();
    const redactIfNeeded = (key) => (key && SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : null);
    const sanitizeValue = (val, keyHint) => {
      if (val == null) return val;
      if (typeof val === 'string') {
        if (keyHint && IP_KEY_RE.test(keyHint)) return maskIP(val);
        return val;
      }
      if (typeof val === 'bigint') return val.toString();
      if (typeof val === 'function') return '[Function]';
      if (typeof val === 'symbol') return '[Symbol]';
      if (typeof val !== 'object') return val;
      if (val instanceof Error) {
        return {
          name: val.name,
          message: val.message,
          stack: IS_PROD ? undefined : val.stack
        };
      }
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
      if (Array.isArray(val)) return val.map((item) => sanitizeValue(item, keyHint));
      const out = {};
      Object.keys(val).forEach((k) => {
        const redacted = redactIfNeeded(k);
        if (redacted) {
          out[k] = redacted;
        }
        else {
          out[k] = sanitizeValue(val[k], k);
        }
      });
      return out;
    };
    return sanitizeValue(value, '');
  }

  const Logger = (() => {
    const resolveLevel = () => {
      if (logLevel === 'off') return 'silent';
      if (IS_PROD && logLevel === 'debug') return 'info';
      return logLevel;
    };

    const buildLogger = () => pino({
      level: resolveLevel(),
      browser: {
        asObject: true
      }
    });

    let pinoLogger = buildLogger();

    const refresh = () => {
      pinoLogger = buildLogger();
    };

    const formatEntry = (level, message, context) => ({
      timestamp: new Date().toISOString(),
      level,
      message: String(message || ''),
      context: sanitizeContext(context || {})
    });

    const emit = (level, message, context) => {
      const entry = formatEntry(level, message, context);
      if (logToConsole && pinoLogger && typeof pinoLogger[level] === 'function') {
        pinoLogger[level](entry);
      }
      return entry;
    };

    return {
      debug: (message, context) => emit('debug', message, context),
      info: (message, context) => emit('info', message, context),
      warn: (message, context) => emit('warn', message, context),
      error: (message, context) => emit('error', message, context),
      refresh,
      __selfTest: (context) => formatEntry('info', 'selftest', context)
    };
  })();

  function logEvent(level, event, data) {
    const safeLevel = LOG_LEVELS[level] ? level : 'info';
    if (!canLog(safeLevel)) return;
    const eventName = String(event || '').trim() || 'event';
    const timestamp = new Date().toISOString();
    const context = sanitizeContext(data);
    const entry = {
      seq: ++logSeq,
      timestamp,
      level: safeLevel,
      message: eventName,
      context,
      severity: getEventSeverity(safeLevel),
      event: eventName,
      eventId: getEventId(eventName),
      category: getEventCategory(eventName),
      outcome: getEventOutcome(eventName, data, safeLevel),
      source: LOG_SOURCE,
      component: LOG_COMPONENT,
      sessionId: SESSION_ID,
      version: SCRIPT_VERSION
    };
    pushLog(entry);
    Logger[safeLevel](eventName, context);
  }

  function setLogLevel(level) {
    let next = LOG_LEVELS[level] ? level : 'info';
    if (IS_PROD && next === 'debug') next = 'info';
    logLevel = next;
    localStorage.setItem(LOG_KEY, next);
    Logger.refresh();
    logEvent('info', 'logLevel', {
      level: next,
      note: 'Use CGPT_VS.exportLogs() or the panel button to export logs.'
    });
  }

  function setLogConsole(enabled) {
    logToConsole = !!enabled;
    localStorage.setItem(LOG_CONSOLE_KEY, logToConsole ? '1' : '0');
    Logger.refresh();
    logEvent('info', 'logConsole', {
      enabled: logToConsole
    });
  }

  function setChatPause(enabled) {
    autoPauseOnChat = !!enabled;
    saveBool(KEY_CHAT_PAUSE, autoPauseOnChat);
    if (!autoPauseOnChat) chatBusy = false;
    logEvent('info', 'chat.pauseMode', {
      enabled: autoPauseOnChat
    });
    scheduleVirtualize();
    updateUI();
  }

  function getPauseReason() {
    if (!virtualizationEnabled) return 'manual';
    if (ctrlFFreeze) return 'find';
    if (autoPauseOnChat && chatBusy) return 'chat';
    return '';
  }

  function pauseReasonLabel(reason) {
    if (reason === 'chat') return t('pauseByChat');
    if (reason === 'find') return t('pauseByFind');
    if (reason === 'manual') return t('pauseByManual');
    return '';
  }

  function pauseReasonText(reason) {
    if (reason === 'chat') {
      return lang === 'zh'
        ? '回复生成中：已自动暂停优化以避免干扰。'
        : 'Assistant replying: optimization is paused to avoid interference.';
    }
    if (reason === 'find') {
      return lang === 'zh'
        ? 'Ctrl+F 搜索中：已暂停以保证能搜到所有历史。'
        : 'Find (Ctrl+F) is active: paused so all history is searchable.';
    }
    if (reason === 'manual') {
      return lang === 'zh'
        ? '已手动暂停：完整显示历史，但更容易卡顿。'
        : 'Manual pause: full history is visible, but it may be heavier.';
    }
    return lang === 'zh'
      ? '状态由性能与服务/IP/PoW 综合评估。'
      : 'Status combines performance with service/IP/PoW signals.';
  }

  function getStateSnapshot() {
    updateChatBusy(false);
    const domNodes = getDomNodeCount();
    const usedMB = getUsedHeapMB();
    const scrollInfo = getScrollMetrics();
    const degraded = getDegradedHealth();
    const pauseReason = getPauseReason();
    const virtMode = (hardActive || !useSoftVirtualization) ? 'hard' : 'soft';
    return {
      version: SCRIPT_VERSION,
      url: location.href,
      lang,
      mode: currentMode,
      virtualizationEnabled,
      pinned,
      ctrlFFreeze,
      pausedReason: pauseReason || '',
      paused: !!pauseReason,
      turns: lastTurnsCount || 0,
      virtualized: lastVirtualizedCount || 0,
      domNodes,
      memMB: usedMB == null ? null : Number(usedMB.toFixed(1)),
      scrollY: Math.round(scrollInfo.top),
      viewportH: Math.round(scrollInfo.height),
      logLevel,
      logToConsole,
      virtualizationMode: virtMode,
      hardActive,
      hardActiveSource: hardActiveSource || '',
      autoPauseOnChat,
      chatBusy: !!chatBusy,
      degradedSeverity: degraded.severity,
      degradedServiceIndicator: degradedState.service.indicator,
      degradedServiceDesc: degradedState.service.description,
      degradedIp: degradedState.ip.masked,
      degradedIpScore: degradedState.ip.qualityScore,
      degradedPowDifficulty: degradedState.pow.difficulty,
      degradedPowLevel: degradedState.pow.levelLabel,
      scrollRoot: scrollRootIsWindow ? 'window' : (scrollRoot && scrollRoot.tagName ? scrollRoot.tagName.toLowerCase() : 'element')
    };
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function getLocalDateKey(date) {
    const d = date instanceof Date ? date : new Date();
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
  }

  function getNextLocalMidnightMs() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }

  function formatLocalTimestamp(date) {
    const d = date instanceof Date ? date : new Date();
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  function formatFileTimestamp(date) {
    const d = date instanceof Date ? date : new Date();
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }

  function safeJsonStringify(value) {
    try {
      const json = JSON.stringify(value);
      if (json === undefined) return String(value);
      return json;
    }
    catch {
      try {
        return String(value);
      }
      catch {
        return '[unserializable]';
      }
    }
  }

  function formatLogValue(value) {
    if (value == null) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    let text = (typeof value === 'string') ? value : safeJsonStringify(value);
    if (text == null) return '';
    text = String(text).replace(/\r?\n/g, '\\n');
    if (!text) return "''";
    const needsQuote = /[\\s=]/.test(text) || text.includes('"') || text.includes("'");
    if (!needsQuote) return text;
    const escaped = text.replace(/'/g, "'\\''");
    return `'${escaped}'`;
  }

  function formatLogLine(entry) {
    const payload = {
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      context: entry.context ?? null,
      severity: entry.severity,
      event: entry.event,
      event_id: entry.eventId,
      category: entry.category,
      outcome: entry.outcome,
      source: entry.source,
      component: entry.component,
      session_id: entry.sessionId,
      version: entry.version,
      seq: entry.seq
    };
    return JSON.stringify(payload);
  }

  function formatDurationMs(ms) {
    if (!isFinite(ms) || ms < 0) return 'n/a';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h${pad2(m)}m${pad2(s)}s`;
    return `${m}m${pad2(s)}s`;
  }

  function formatAge(ts) {
    if (!ts) return 'n/a';
    const age = Date.now() - ts;
    return `${formatLocalTimestamp(new Date(ts))} (${formatDurationMs(age)})`;
  }

  function describeEl(el) {
    if (!el) return 'n/a';
    if (el === window) return 'window';
    if (el === document) return 'document';
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';
    const tag = (el.tagName || '').toLowerCase() || 'element';
    const id = el.id ? `#${el.id}` : '';
    return `${tag}${id}`;
  }

  function severityTag(level) {
    if (level === 'bad') return 'BAD';
    if (level === 'warn') return 'WARN';
    if (level === 'ok') return 'OK';
    return 'SUSPECT';
  }

  function formatTaggedLine(label, level, value, note) {
    const tag = severityTag(level);
    const detail = value == null || value === '' ? '--' : String(value);
    const extra = note ? ` | ${note}` : '';
    return `[${tag}] ${label}: ${detail}${extra}`;
  }

  // ========================== Service/IP/PoW Session Cache ==========================
  function getStaleHint(ts) {
    if (!ts) return lang === 'zh' ? '缓存: 无时间' : 'cache: unknown';
    const age = formatDurationMs(Date.now() - ts);
    return lang === 'zh' ? `缓存: ${age}` : `cache: ${age}`;
  }

  function getStorageSafe(kind) {
    try {
      if (kind === 'local' && typeof localStorage !== 'undefined') return localStorage;
      if (kind === 'session' && typeof sessionStorage !== 'undefined') return sessionStorage;
    }
    catch {}
    return null;
  }

  function readDegradedCacheFrom(storage) {
    if (!storage) return null;
    try {
      const raw = storage.getItem(DEG_CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== DEG_CACHE_VERSION) return null;
      if (data.savedAt && (Date.now() - data.savedAt) > DEG_CACHE_MAX_AGE_MS) return null;
      return data;
    }
    catch {
      return null;
    }
  }

  function loadDegradedCache() {
    const localStore = getStorageSafe('local');
    const sessionStore = getStorageSafe('session');
    const local = readDegradedCacheFrom(localStore);
    if (local) return local;
    const session = readDegradedCacheFrom(sessionStore);
    if (session && localStore) {
      try {
        localStore.setItem(DEG_CACHE_KEY, JSON.stringify(session));
      }
      catch {}
    }
    return session;
  }

  function saveDegradedCache() {
    try {
      const payload = {
        v: DEG_CACHE_VERSION,
        savedAt: Date.now(),
        service: {
          indicator: degradedState.service.indicator,
          description: degradedState.service.description,
          officialDescription: degradedState.service.officialDescription,
          issueLines: degradedState.service.issueLines,
          issueCount: degradedState.service.issueCount,
          color: degradedState.service.color,
          updatedAt: degradedState.service.updatedAt
        },
        ip: {
          masked: degradedState.ip.masked,
          full: degradedState.ip.full,
          warp: degradedState.ip.warp,
          qualityLabel: degradedState.ip.qualityLabel,
          qualityShort: degradedState.ip.qualityShort,
          qualityProbability: degradedState.ip.qualityProbability,
          qualityColor: degradedState.ip.qualityColor,
          qualityScore: degradedState.ip.qualityScore,
          qualityTooltip: degradedState.ip.qualityTooltip,
          historyTooltip: degradedState.ip.historyTooltip,
          updatedAt: degradedState.ip.updatedAt,
          qualityAt: degradedState.ip.qualityAt
        },
        pow: {
          difficulty: degradedState.pow.difficulty,
          levelLabel: degradedState.pow.levelLabel,
          levelKey: degradedState.pow.levelKey,
          color: degradedState.pow.color,
          percentage: degradedState.pow.percentage,
          updatedAt: degradedState.pow.updatedAt
        },
        user: {
          type: degradedState.user.type,
          paid: degradedState.user.paid
        }
      };
      const localStore = getStorageSafe('local');
      const sessionStore = getStorageSafe('session');
      if (localStore) localStore.setItem(DEG_CACHE_KEY, JSON.stringify(payload));
      if (sessionStore) sessionStore.setItem(DEG_CACHE_KEY, JSON.stringify(payload));
    }
    catch {}
  }

  function applyDegradedCache(cache) {
    if (!cache) return false;
    const svc = cache.service || {};
    if (svc.indicator || svc.description) {
      degradedState.service.indicator = svc.indicator || degradedState.service.indicator;
      degradedState.service.description = svc.description || degradedState.service.description;
      degradedState.service.officialDescription = svc.officialDescription || degradedState.service.officialDescription;
      if (Array.isArray(svc.issueLines)) {
        degradedState.service.issueLines = svc.issueLines
          .map((line) => String(line || '').trim())
          .filter(Boolean)
          .slice(0, 4);
      }
      if (svc.issueCount != null && Number.isFinite(Number(svc.issueCount))) {
        degradedState.service.issueCount = Number(svc.issueCount);
      }
      degradedState.service.color = svc.color || degradedState.service.color;
      degradedState.service.updatedAt = svc.updatedAt || degradedState.service.updatedAt;
    }

    const ip = cache.ip || {};
    if (ip.masked || ip.full || ip.qualityLabel) {
      degradedState.ip.masked = ip.masked || degradedState.ip.masked;
      degradedState.ip.full = ip.full || degradedState.ip.full;
      degradedState.ip.warp = ip.warp || degradedState.ip.warp;
      degradedState.ip.qualityLabel = ip.qualityLabel || degradedState.ip.qualityLabel;
      degradedState.ip.qualityShort = ip.qualityShort || degradedState.ip.qualityShort;
      degradedState.ip.qualityProbability = ip.qualityProbability || degradedState.ip.qualityProbability;
      degradedState.ip.qualityColor = ip.qualityColor || degradedState.ip.qualityColor;
      degradedState.ip.qualityScore = (ip.qualityScore == null) ? degradedState.ip.qualityScore : ip.qualityScore;
      degradedState.ip.qualityTooltip = ip.qualityTooltip || degradedState.ip.qualityTooltip;
      degradedState.ip.historyTooltip = ip.historyTooltip || degradedState.ip.historyTooltip;
      degradedState.ip.updatedAt = ip.updatedAt || degradedState.ip.updatedAt;
      degradedState.ip.qualityAt = ip.qualityAt || degradedState.ip.qualityAt;
    }

    const pow = cache.pow || {};
    if (pow.difficulty || pow.levelLabel || pow.levelKey) {
      degradedState.pow.difficulty = pow.difficulty || degradedState.pow.difficulty;
      degradedState.pow.levelLabel = pow.levelLabel || degradedState.pow.levelLabel;
      degradedState.pow.levelKey = pow.levelKey || degradedState.pow.levelKey;
      degradedState.pow.color = pow.color || degradedState.pow.color;
      degradedState.pow.percentage = (pow.percentage == null) ? degradedState.pow.percentage : pow.percentage;
      degradedState.pow.updatedAt = pow.updatedAt || degradedState.pow.updatedAt;
    }

    const user = cache.user || {};
    if (user.type) degradedState.user.type = user.type;
    if (typeof user.paid === 'boolean') degradedState.user.paid = user.paid;
    return true;
  }

  function getScrollBottomGap(scrollInfo) {
    const info = scrollInfo || getScrollMetrics();
    if (info.isWindow) {
      const doc = document.scrollingElement || document.documentElement || document.body;
      const maxTop = Math.max(0, (doc.scrollHeight || 0) - window.innerHeight);
      const top = Math.max(0, Math.round(window.scrollY || 0));
      return {
        top,
        maxTop: Math.round(maxTop),
        gap: Math.max(0, Math.round(maxTop - top))
      };
    }
    const rootEl = info.root;
    const maxTop = Math.max(0, (rootEl.scrollHeight || 0) - (rootEl.clientHeight || 0));
    const top = Math.max(0, Math.round(rootEl.scrollTop || 0));
    return {
      top,
      maxTop: Math.round(maxTop),
      gap: Math.max(0, Math.round(maxTop - top))
    };
  }

  function sanitizeFilenamePart(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    return raw
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  function resolveConversationTitle() {
    const titleCandidates = [
      '[data-testid="conversation-title"]',
      'main h1',
      'h1'
    ];
    for (const selector of titleCandidates) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const txt = String(el.textContent || '').trim();
      if (txt) return txt;
    }
    const title = String(document.title || '').replace(/\s*-\s*ChatGPT.*$/i, '').trim();
    if (title) return title;
    return lang === 'zh' ? 'ChatGPT 对话' : 'ChatGPT Conversation';
  }

  function normalizeExportText(text) {
    if (!text) return '';
    return String(text)
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractTextForExport(node) {
    if (!node || typeof node.cloneNode !== 'function') return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, svg, path, button, textarea, input, select, noscript, iframe, canvas, audio, video, [aria-hidden="true"], .sr-only').forEach((el) => {
      el.remove();
    });
    const text = clone.innerText || clone.textContent || '';
    return normalizeExportText(text);
  }

  function inferMessageRole(node) {
    if (!node || typeof node.getAttribute !== 'function') return 'user';
    const direct = String(node.getAttribute('data-message-author-role') || '').toLowerCase().trim();
    if (direct) return direct;
    const nearest = node.closest('[data-message-author-role]');
    if (nearest && nearest !== node) {
      const nearRole = String(nearest.getAttribute('data-message-author-role') || '').toLowerCase().trim();
      if (nearRole) return nearRole;
    }
    const blob = `${node.className || ''} ${node.getAttribute('data-testid') || ''}`.toLowerCase();
    if (/assistant|model|ai/.test(blob)) return 'assistant';
    if (/system/.test(blob)) return 'system';
    return 'user';
  }

  function collectConversationExportTurns() {
    const turns = [];
    const nodes = getMessageNodes();
    for (const turnEl of nodes) {
      const localRoleNodes = [];
      if (turnEl.matches && turnEl.matches('[data-message-author-role]')) {
        localRoleNodes.push(turnEl);
      }
      turnEl.querySelectorAll('[data-message-author-role]').forEach((roleEl) => {
        const parentRole = roleEl.parentElement ? roleEl.parentElement.closest('[data-message-author-role]') : null;
        if (parentRole) return;
        localRoleNodes.push(roleEl);
      });

      if (localRoleNodes.length) {
        const seen = new Set();
        for (const roleEl of localRoleNodes) {
          if (!roleEl || seen.has(roleEl)) continue;
          seen.add(roleEl);
          const text = extractTextForExport(roleEl);
          if (!text) continue;
          turns.push({
            role: inferMessageRole(roleEl),
            text
          });
        }
        continue;
      }

      const text = extractTextForExport(turnEl);
      if (!text) continue;
      turns.push({
        role: inferMessageRole(turnEl),
        text
      });
    }
    return turns;
  }

  function buildConversationExportPayload() {
    const now = new Date();
    const route = resolveConversationRouteInfo({
      url: location.href,
      fallbackPath: location.pathname || '/'
    });
    const title = resolveConversationTitle();
    const turns = collectConversationExportTurns();
    const text = buildConversationExportMarkdown({
      title,
      url: location.href,
      exportedAtLocal: formatLocalTimestamp(now),
      exportedAtIso: now.toISOString(),
      scriptVersion: SCRIPT_VERSION,
      turns
    });
    return {
      now,
      route,
      title,
      turns,
      text
    };
  }

  function exportConversationToFile(reason) {
    const nodes = getMessageNodes();
    const hasHardSlim = nodes.some((node) => !!(node && node.dataset && node.dataset.vsSlimmed));
    if (hasHardSlim) unvirtualizeAll();
    const payload = buildConversationExportPayload();
    logEvent('info', 'chat.export', {
      reason: reason || 'manual',
      conversationId: payload.route.conversationId || '',
      route: payload.route.pathname || '',
      turns: payload.turns.length,
      hardRestored: hasHardSlim
    });
    const titlePart = sanitizeFilenamePart(payload.title).slice(0, 36);
    const stamp = formatFileTimestamp(payload.now);
    const filename = titlePart
      ? `cgpt-glass-conversation-${titlePart}-${stamp}.md`
      : `cgpt-glass-conversation-${stamp}.md`;
    downloadTextFile(filename, payload.text);
    if (hasHardSlim && virtualizationEnabled && !ctrlFFreeze) {
      setTimeout(() => scheduleVirtualize(), 160);
    }
    return payload.text;
  }

  function buildLogExportText(reason) {
    const now = new Date();
    const nowMs = Date.now();
    const state = getStateSnapshot();
    const marginSnap = getDynamicMargins(true);
    const scrollIdleMs = lastScrollAt ? Math.max(0, nowMs - lastScrollAt) : null;
    const hardDeferMs = hardScrollDeferAt ? Math.max(0, nowMs - hardScrollDeferAt) : null;
    const busyRemainingMs = optimizeBusyUntil && (optimizeBusyUntil > nowMs)
      ? (optimizeBusyUntil - nowMs)
      : 0;
    const marginOverrideRemainingMs = marginSnap.overrideUntil && (marginSnap.overrideUntil > nowMs)
      ? (marginSnap.overrideUntil - nowMs)
      : 0;
    const gateTurns = getTurnsCountCached(false) || state.turns || 0;
    const gate = getOptimizeGateStatus(nowMs, gateTurns, state.domNodes, state.memMB);
    const optimizingStatus = resolveOptimizingStatus({
      virtualizationEnabled,
      ctrlFFreeze,
      autoPauseOnChat,
      chatBusy,
      gateReady: !!gate.ready,
      hardSliceActive: !!hardSliceState.active,
      optimizeActive: !!optimizeState.active,
      lastWorkAt: optimizeState.lastWorkAt,
      optimizeBusyUntil,
      optimizeHoldMs: OPTIMIZE_HOLD_MS,
      now: nowMs
    });
    const optimizingNow = !!optimizingStatus.optimizing;
    const entries = logBuffer.slice();
    const route = resolveConversationRouteInfo({
      url: state.url,
      fallbackPath: location.pathname || '/'
    });
    const convTitle = resolveConversationTitle();
    const turnNodes = getMessageNodes().length;
    const scrollBottom = getScrollBottomGap();
    const recentIssues = entries.filter((e) => e.level === 'warn' || e.level === 'error').slice(-12);
    const counts = {
      info: 0,
      warn: 0,
      error: 0,
      debug: 0
    };
    entries.forEach((e) => {
      const key = String(e.level || '').toLowerCase();
      if (counts[key] != null) counts[key] += 1;
    });

    const memInfo = memoryLevel(state.memMB);
    const domInfo = domLevel(state.domNodes);
    const serviceFresh = isFresh(degradedState.service.updatedAt, DEG_STATUS_TTL_MS);
    const serviceInfo = getServiceIndicatorInfo(degradedState.service.indicator, degradedState.service.description);
    const serviceSev = serviceFresh ? serviceInfo.severity : 'na';
    const ipFresh = isFresh(degradedState.ip.qualityAt, DEG_IP_TTL_MS);
    const ipInfo = getIpRiskInfo(degradedState.ip.qualityScore);
    const ipSev = ipFresh ? ipInfo.severity : 'na';
    // Keep last known PoW visible even if stale; gray color indicates staleness.
    const powFresh = isFresh(degradedState.pow.updatedAt, DEG_POW_TTL_MS);
    const powInfo = getPowRiskInfo(degradedState.pow.difficulty);
    const powSev = powFresh ? powInfo.severity : 'na';
    const virtSev = state.virtualizationEnabled ? 'ok' : 'warn';
    const pauseSev = state.paused ? (state.pausedReason === 'manual' ? 'warn' : 'na') : 'ok';
    const overallSev = maxSeverity([memInfo.level, domInfo.level, serviceSev, ipSev, powSev, virtSev, pauseSev]);
    const firstEvent = entries.length ? entries[0].timestamp : '';
    const lastEvent = entries.length ? entries[entries.length - 1].timestamp : '';
    const eventsRange = (firstEvent && lastEvent)
      ? { first: firstEvent, last: lastEvent }
      : null;
    const recentIssueItems = recentIssues.map((e) => ({
      timestamp: e.timestamp,
      level: String(e.level || '').toLowerCase(),
      event: e.event || e.message || 'unknown',
      message: e.context && e.context.message ? String(e.context.message) : ''
    }));

    const doc = buildStructuredLogExport({
      schemaVersion: '2.0.0',
      source: LOG_SOURCE,
      component: LOG_COMPONENT,
      generatedAtIso: now.toISOString(),
      generatedAtLocal: formatLocalTimestamp(now),
      reason: reason || '',
      session: {
        id: SESSION_ID,
        started_at_iso: new Date(SESSION_STARTED_AT).toISOString(),
        started_at_local: formatLocalTimestamp(new Date(SESSION_STARTED_AT)),
        age: formatDurationMs(Date.now() - SESSION_STARTED_AT),
        scope: 'current_page_lifetime',
        version: state.version,
        url: state.url,
        host: location.host || '--',
        user_agent: navigator.userAgent,
        log_level: logLevel,
        log_console: logToConsole ? 'on' : 'off',
        entries: {
          total: entries.length,
          by_level: counts,
          range: eventsRange
        },
        timezone_offset_min: new Date().getTimezoneOffset(),
        event_fields: LOG_FIELD_ORDER.slice()
      },
      conversation: {
        title: convTitle,
        pathname: route.pathname,
        route_key: route.routeKey,
        conversation_id: route.conversationId || '',
        is_conversation: !!route.isConversation,
        turn_nodes: turnNodes
      },
      health: {
        overall: overallSev,
        memory: {
          level: memInfo.level,
          label: memInfo.label
        },
        dom: {
          level: domInfo.level,
          label: domInfo.label
        },
        service: {
          level: serviceSev,
          indicator: degradedState.service.indicator || '',
          label: serviceInfo.label,
          fresh: !!serviceFresh
        },
        ip: {
          level: ipSev,
          masked: degradedState.ip.masked || '--',
          label: degradedState.ip.qualityLabel || '',
          fresh: !!ipFresh
        },
        pow: {
          level: powSev,
          difficulty: degradedState.pow.difficulty || '',
          label: degradedState.pow.levelLabel || '',
          fresh: !!powFresh
        },
        virtualization: {
          level: virtSev,
          enabled: !!state.virtualizationEnabled,
          mode: state.virtualizationMode
        },
        pause: {
          level: pauseSev,
          active: !!state.paused,
          reason: state.pausedReason || ''
        }
      },
      runtime: {
        mode: state.mode,
        virtualization_enabled: !!state.virtualizationEnabled,
        soft_virtualization: !!useSoftVirtualization,
        hard_active: !!hardActive,
        hard_source: state.hardActiveSource || '',
        paused: !!state.paused,
        paused_reason: state.pausedReason || '',
        auto_pause_on_chat: !!state.autoPauseOnChat,
        chat_busy: !!state.chatBusy,
        turns: state.turns,
        virtualized: state.virtualized,
        dom_nodes: state.domNodes,
        memory_mb: state.memMB,
        scroll: {
          y: state.scrollY,
          viewport_h: state.viewportH,
          root: state.scrollRoot,
          last_at: lastScrollAt || 0,
          last_top: Math.round(lastScrollTop || 0),
          idle_ms: scrollIdleMs,
          bottom_gap: scrollBottom.gap
        },
        degraded: {
          severity: state.degradedSeverity,
          service_indicator: state.degradedServiceIndicator,
          service_desc: state.degradedServiceDesc || '',
          ip: state.degradedIp || '',
          ip_score: state.degradedIpScore,
          pow_difficulty: state.degradedPowDifficulty || '',
          pow_level: state.degradedPowLevel || ''
        },
        optimize: {
          gate_ready: !!gate.ready,
          gate_load_ready: !!gate.loadReady,
          gate_pressure_ready: !!gate.pressureReady,
          gate_pressure_level: gate.pressureLevel || 'na',
          active: !!optimizeState.active,
          optimizing_now: optimizingNow,
          last_work_at: optimizeState.lastWorkAt || 0,
          busy_until: optimizingStatus.nextBusyUntil || 0,
          busy_remaining_ms: busyRemainingMs
        },
        margins: {
          soft: marginSnap.soft,
          hard: marginSnap.hard,
          desired_soft: marginSnap.desiredSoft,
          desired_hard: marginSnap.desiredHard,
          auto_hard_dom: marginSnap.autoHardDom,
          auto_hard_exit: marginSnap.autoHardExit,
          override: !!(marginSnap.overrideUntil && nowMs < marginSnap.overrideUntil),
          override_reason: marginSnap.overrideReason || '',
          override_remaining_ms: marginOverrideRemainingMs
        },
        cache: {
          msg_count: msgCache.length,
          msg_dirty: !!msgCacheDirty,
          msg_age_ms: msgCacheAt ? Math.max(0, nowMs - msgCacheAt) : null,
          turns_count: turnsCountCache,
          turns_age_ms: turnsCountAt ? Math.max(0, nowMs - turnsCountAt) : null,
          dom_age_ms: domCountAt ? Math.max(0, nowMs - domCountAt) : null
        }
      },
      bugFocus: {
        route_auto_scroll: {
          last_at: lastRouteAutoScrollAt || 0,
          timer_on: !!routeAutoScrollTimer,
          min_interval_ms: ROUTE_AUTO_SCROLL_MIN_INTERVAL_MS,
          delays_ms: ROUTE_AUTO_SCROLL_DELAYS_MS.slice()
        },
        observers: {
          message_observer: !!msgObserver,
          soft_observer: !!softObserver,
          message_container: describeEl(msgContainer)
        },
        hard_slice: {
          active: !!hardSliceState.active,
          steps: hardSliceState.steps,
          index: hardSliceState.index,
          total: hardSliceState.total,
          last_step_at: hardSliceState.lastStepAt || 0,
          last_pass_at: lastHardPassAt || 0,
          scroll_defer_at: hardScrollDeferAt || 0,
          scroll_defer_ms: hardDeferMs
        },
        recent_issues: recentIssueItems,
        capture_hint: [
          "Reproduce once, then export logs.",
          "If bug is hard to catch, run CGPT_VS.setLogLevel('debug') before reproducing."
        ]
      },
      events: entries.map((e) => ({
        timestamp: e.timestamp,
        level: e.level,
        message: e.message,
        context: e.context ?? null,
        severity: e.severity,
        event: e.event,
        event_id: e.eventId,
        category: e.category,
        outcome: e.outcome,
        source: e.source,
        component: e.component,
        session_id: e.sessionId,
        version: e.version,
        seq: e.seq
      }))
    });
    return JSON.stringify(doc, null, 2);
  }

  function downloadTextFile(filename, text, contentType) {
    try {
      if (!document.body) throw new Error('document.body missing');
      const type = String(contentType || 'text/plain;charset=utf-8');
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    }
    catch (err) {
      logEvent('warn', 'log.export.fail', { message: err?.message || String(err) });
    }
  }

  function exportLogsToFile(reason) {
    logEvent('info', 'log.export', { reason: reason || 'manual', count: logBuffer.length });
    const text = buildLogExportText(reason);
    const filename = `cgpt-glass-log-${formatFileTimestamp(new Date())}.json`;
    downloadTextFile(filename, text, 'application/json;charset=utf-8');
    return text;
  }

  function dumpLogs(reason) {
    const text = buildLogExportText(reason);
    return text;
  }

  function clearAutoHard(reason, domNodes) {
    if (!hardActive || hardActiveSource !== 'auto') return false;
    const count = (typeof domNodes === 'number') ? domNodes : getDomNodeCount();
    hardActive = false;
    hardActiveSource = '';
    autoHardBelowAt = 0;
    logEvent('info', 'hard.auto.off', {
      reason: reason || 'auto',
      domNodes: count,
      threshold: AUTO_HARD_EXIT_DOM
    });
    return true;
  }
  // endregion: Logging & Diagnostics

  // region: SelfCheck
  // ========================== 自检入口（TDD 执行器） ==========================
  const SelfCheck = (() => {
    const tests = [];
    const register = (name, fn) => {
      tests.push({
        name: String(name || 'unnamed'),
        fn
      });
    };
    const run = () => {
      const results = tests.map((test) => {
        try {
          const out = test.fn();
          const ok = !!(out && out.ok);
          return {
            name: test.name,
            ok,
            detail: out && out.detail ? String(out.detail) : ''
          };
        }
        catch (err) {
          return {
            name: test.name,
            ok: false,
            detail: err && err.message ? err.message : String(err)
          };
        }
      });
      const ok = results.every((result) => result.ok);
      return { ok, results };
    };
    return { register, run };
  })();

  SelfCheck.register('logger.schema', () => {
    const entry = Logger.__selfTest();
    const ok = !!(entry && entry.timestamp && entry.level && entry.message && entry.context);
    return {
      ok,
      detail: ok ? '' : 'missing fields'
    };
  });

  SelfCheck.register('logger.sanitize', () => {
    const entry = Logger.__selfTest({
      token: 'secret',
      password: 'x'
    });
    const ok = entry.context &&
      entry.context.token === '[REDACTED]' &&
      entry.context.password === '[REDACTED]';
    return {
      ok,
      detail: ok ? '' : 'sensitive data not redacted'
    };
  });

  SelfCheck.register('scheduler.gate', () => {
    const ok = Scheduler.shouldRun({
      hidden: true,
      chatBusy: true,
      paused: true
    }) === false;
    return {
      ok,
      detail: ok ? '' : 'gate should block'
    };
  });

  SelfCheck.register('store.update', () => {
    const store = createStore({ a: 1 });
    store.set({ a: 2 });
    return {
      ok: store.get().a === 2,
      detail: 'store did not update'
    };
  });

  SelfCheck.register('virt.marginPlanner', () => {
    const out = planMarginsDP(100, 'balanced', { soft: 2, hard: 4 });
    const ok = !!(out && out.soft >= 1 && out.hard >= out.soft + 1);
    return {
      ok,
      detail: ok ? '' : 'planner output invalid'
    };
  });

  SelfCheck.register('monitor.pow', () => {
    const info = findPowDataInJson({ pow: { difficulty: '0x1a2b' } });
    const ok = !!(info && info.difficulty === '0x1a2b');
    return {
      ok,
      detail: ok ? '' : 'pow parse failed'
    };
  });

  SelfCheck.register('ui.format', () => {
    const ui = formatUIState({ mode: 'balanced', dom: 1000 });
    const ok = ui && ui.modeLabel === modeLabel('balanced');
    return {
      ok,
      detail: ok ? '' : 'ui state format failed'
    };
  });
  // endregion: SelfCheck

  // region: Scheduler
  // ========================== 统一调度与门禁 ==========================
  const Scheduler = (() => {
    const timers = new Set();
    const shouldRun = (state) => {
      if (!state) return true;
      if (state.hidden || state.chatBusy || state.paused) return false;
      return true;
    };
    const setTimeoutSafe = (fn, ms) => {
      const id = setTimeout(fn, ms);
      timers.add(id);
      return id;
    };
    const clearAll = () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
    return {
      shouldRun,
      setTimeoutSafe,
      clearAll
    };
  })();
  // endregion: Scheduler

  // region: Store
  // ========================== 统一状态仓储 ==========================
  const createStore = (initial) => {
    let state = { ...initial };
    const listeners = new Set();
    const get = () => ({ ...state });
    const set = (patch) => {
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(get()));
    };
    const subscribe = (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    };
    return {
      get,
      set,
      subscribe
    };
  };
  // endregion: Store

  // region: Degradation Monitor (network + parsing)
  // ========================== 服务降级监控：工具函数 ==========================
  function gmRequestText(url, timeoutMs = DEG_REQ_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          timeout: timeoutMs,
          onload: (r) => {
            if (r.status >= 200 && r.status < 300) resolve(r.responseText);
            else reject(new Error(`HTTP ${r.status}`));
          },
          onerror: (err) => reject(err instanceof Error ? err : new Error('Network error')),
          ontimeout: () => reject(new Error('Request timed out'))
        });
        return;
      }

      // fallback: same-origin fetch (best effort)
      fetch(url, { method: 'GET', credentials: 'omit' })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(resolve)
        .catch(reject);
    });
  }

  function parseJsonTextSafe(text) {
    if (text == null) return null;
    let raw = String(text).trim();
    if (!raw) return null;
    raw = raw.replace(/^\)\]\}',?\s*/, '');
    const firstBrace = raw.indexOf('{');
    const firstBracket = raw.indexOf('[');
    let start = -1;
    if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket);
    else start = Math.max(firstBrace, firstBracket);
    if (start > 0) raw = raw.slice(start);
    try {
      return JSON.parse(raw);
    }
    catch {
      return null;
    }
  }

  async function readJsonSafe(response) {
    if (!response || typeof response.text !== 'function') return null;
    try {
      const text = await response.text();
      return parseJsonTextSafe(text);
    }
    catch {
      return null;
    }
  }

  function isJsonContentType(contentType) {
    const ct = String(contentType || '').toLowerCase();
    return ct.includes('application/json') || ct.includes('+json');
  }

  const POW_JSON_PARSE_MAX_BYTES = 180 * 1024;
  const POW_JSON_ALLOW_RE = /\/(?:backend-api|api)\/sentinel\//i;
  const POW_JSON_BLOCK_RE = /\/backend-api\/conversations?(?:\/|$)|\/backend-api\/conversation(?:\/|$)/i;

  function getSameOriginPath(url) {
    if (!url) return '';
    if (url.startsWith('/')) return url;
    if (url.startsWith(location.origin)) return url.slice(location.origin.length);
    return '';
  }

  function parseContentLength(raw) {
    if (!raw) return Number.NaN;
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function shouldParsePowJsonByUrl(url, contentLength) {
    const path = getSameOriginPath(String(url || ''));
    if (!path) return false;
    if (!/\/(backend-api|api)\//i.test(path)) return false;
    if (isChatRequirementsUrl(path)) return true;
    if (POW_JSON_ALLOW_RE.test(path)) return true;
    if (POW_JSON_BLOCK_RE.test(path)) return false;
    if (!Number.isFinite(contentLength)) return false;
    return contentLength <= POW_JSON_PARSE_MAX_BYTES;
  }

  function getResourceUrl(resource, response) {
    if (resource && typeof resource === 'object' && typeof resource.url === 'string') return resource.url;
    if (typeof resource === 'string') return resource;
    if (response && typeof response.url === 'string') return response.url;
    return '';
  }

  function parseTrace(text) {
    const data = String(text || '').split('\n').reduce((acc, line) => {
      const i = line.indexOf('=');
      if (i <= 0) return acc;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k) acc[k] = v;
      return acc;
    }, {});
    return {
      ip: data.ip || '',
      warp: data.warp || 'off',
      loc: data.loc || '',
      colo: data.colo || ''
    };
  }

  function maskIP(ip) {
    if (!ip) return '--';
    if (ip.includes(':')) {
      const head = ip.slice(0, 6);
      const tail = ip.slice(-4);
      return `${head}…${tail}`;
    }
    const parts = ip.split('.');
    if (parts.length !== 4) return ip;
    return `${parts[0]}.${parts[1]}.*.*`;
  }

  function getIPLogs() {
    try {
      const raw = localStorage.getItem(KEY_IP_LOGS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    }
    catch {
      return [];
    }
  }

  function addIPLog(ip, score, difficulty) {
    if (!ip) return [];
    const logs = getIPLogs();
    const entry = {
      timestamp: new Date().toISOString(),
      ip,
      score: (score == null || Number.isNaN(Number(score))) ? null : Number(score),
      difficulty: difficulty || 'N/A'
    };
    if (logs.length && logs[0].ip === ip) logs[0] = entry;
    else logs.unshift(entry);
    const trimmed = logs.slice(0, 10);
    try {
      localStorage.setItem(KEY_IP_LOGS, JSON.stringify(trimmed));
    }
    catch {}
    return trimmed;
  }

  function formatIPLogs(logs) {
    return logs.map((log) => {
      const d = new Date(log.timestamp);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      const scoreText = (log.score == null) ? 'N/A' : String(log.score);
      const ipInfo = getIpRiskInfo(log.score);
      const ipProb = ipInfo.probability ? ` ${ipInfo.probability}` : '';
      const ipRiskText = `${ipInfo.label || t('riskUnknown')}${ipProb}`.trim();
      const pow = log.difficulty || 'N/A';
      const powInfo = getPowRiskInfo(pow);
      const powLabel = powInfo.levelLabel || t('riskUnknown');
      return `[${yyyy}-${mm}-${dd} ${hh}:${mi}] ${log.ip}(${scoreText}, ${ipRiskText}), ${pow}(${powLabel})`;
    }).join('\n');
  }

  function normalizePowDifficulty(value) {
    if (value == null) return '';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string') return value.trim();
    return '';
  }

  function isPowDifficultyLike(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    const v = value.trim();
    if (!v) return false;
    if (/^0x[0-9a-f]+$/i.test(v)) return true;
    if (/^[0-9a-f]{2,}$/i.test(v)) return true;
    if (/^\d+$/.test(v)) return true;
    return false;
  }

  function findPowDataInJson(root) {
    const seen = new Set();
    const stack = [{
      value: root,
      depth: 0,
      hint: false
    }];
    let hasHint = false;

    while (stack.length) {
      const item = stack.pop();
      const value = item?.value;
      const depth = item?.depth || 0;
      const hint = !!item?.hint;
      if (!value || typeof value !== 'object') continue;
      if (seen.has(value)) continue;
      seen.add(value);

      if (Array.isArray(value)) {
        if (depth >= 6) continue;
        value.forEach((v) => {
          if (v && typeof v === 'object') stack.push({ value: v, depth: depth + 1, hint });
        });
        continue;
      }

      const entries = Object.entries(value);
      for (const [key, val] of entries) {
        const k = String(key || '').toLowerCase();
        const keyHasPow = /pow|proof|work/.test(k);
        const keyHasDiff = k.includes('difficulty');
        if (keyHasPow) hasHint = true;

        if (keyHasDiff && (hint || keyHasPow)) {
          const cand = normalizePowDifficulty(val);
          if (cand && isPowDifficultyLike(cand)) return { difficulty: cand, hasHint: true };
        }

        if (keyHasPow && !keyHasDiff) {
          const cand = normalizePowDifficulty(val);
          if (cand && isPowDifficultyLike(cand)) return { difficulty: cand, hasHint: true };
        }

        if (keyHasPow && val && typeof val === 'object') {
          const direct =
            val?.difficulty ??
            val?.pow_difficulty ??
            val?.powDifficulty ??
            val?.proof_of_work_difficulty ??
            val?.proofOfWorkDifficulty ??
            null;
          const cand = normalizePowDifficulty(direct);
          if (cand && isPowDifficultyLike(cand)) return { difficulty: cand, hasHint: true };
        }

        if (depth < 6 && val && typeof val === 'object') {
          stack.push({ value: val, depth: depth + 1, hint: hint || keyHasPow });
        }
      }
    }

    const direct =
      (root && typeof root === 'object')
        ? (root.pow_difficulty ?? root.powDifficulty ?? root.difficulty)
        : null;
    const cand = normalizePowDifficulty(direct);
    if (cand && isPowDifficultyLike(cand)) return { difficulty: cand, hasHint: true };

    return { difficulty: '', hasHint };
  }

  function getPowRiskInfo(difficulty) {
    if (!difficulty || difficulty === 'N/A') {
      return {
        levelKey: 'riskUnknown',
        levelLabel: t('riskUnknown'),
        severity: 'na',
        color: '#9ca3af',
        percentage: 0
      };
    }
    const clean = String(difficulty).replace(/^0x/i, '').replace(/^0+/, '');
    const len = clean.length || 0;
    if (len <= 2) {
      return { levelKey: 'riskCritical', levelLabel: t('riskCritical'), severity: 'bad', color: '#ef4444', percentage: 100 };
    }
    if (len <= 3) {
      return { levelKey: 'riskHard', levelLabel: t('riskHard'), severity: 'warn', color: '#f59e0b', percentage: 78 };
    }
    if (len <= 4) {
      return { levelKey: 'riskMedium', levelLabel: t('riskMedium'), severity: 'warn', color: '#eab308', percentage: 58 };
    }
    if (len <= 5) {
      return { levelKey: 'riskEasy', levelLabel: t('riskEasy'), severity: 'ok', color: '#22c55e', percentage: 28 };
    }
    return { levelKey: 'riskVeryEasy', levelLabel: t('riskVeryEasy'), severity: 'ok', color: '#10b981', percentage: 8 };
  }

  function setPowDifficulty(difficulty) {
    const normalized = (difficulty === 'N/A') ? 'N/A' : normalizePowDifficulty(difficulty);
    if (!normalized) return false;
    if (normalized !== 'N/A' && !isPowDifficultyLike(normalized)) return false;
    const next = normalized;
    const info = getPowRiskInfo(next);
    degradedState.pow.difficulty = next;
    degradedState.pow.levelLabel = info.levelLabel;
    degradedState.pow.levelKey = info.levelKey;
    degradedState.pow.color = info.color;
    degradedState.pow.percentage = info.percentage;
    degradedState.pow.updatedAt = Date.now();
    return true;
  }

  function applyPowDifficulty(difficulty, source) {
    const applied = setPowDifficulty(difficulty);
    if (!applied) return false;
    if (degradedState.ip.full) {
      const logs = addIPLog(degradedState.ip.full, degradedState.ip.qualityScore, degradedState.pow.difficulty);
      if (logs.length) updateIpHistoryTooltip();
    }
    saveDegradedCache();
    logEvent('debug', 'degraded.pow', {
      difficulty: degradedState.pow.difficulty,
      source: source || ''
    });
    updateUI();
    return true;
  }

  function handlePowFromJsonData(data, source) {
    if (!data) return;
    const info = findPowDataInJson(data);
    if (info.difficulty) {
      applyPowDifficulty(info.difficulty, source);
      return;
    }
    if (info.hasHint && !degradedState.pow.updatedAt) {
      applyPowDifficulty('N/A', source ? `${source}.hint` : 'json.hint');
    }
  }

  function getServiceIndicatorInfo(indicator, description) {
    const ind = String(indicator || '').toLowerCase();
    if (ind === 'none') return { severity: 'ok', color: '#10a37f', label: description || 'All Systems Operational' };
    if (ind === 'minor') return { severity: 'warn', color: '#f59e0b', label: description || 'Minor issues' };
    if (ind === 'major') return { severity: 'bad', color: '#f97316', label: description || 'Major issues' };
    if (ind === 'critical') return { severity: 'bad', color: '#ef4444', label: description || 'Critical outage' };
    return { severity: 'na', color: '#9ca3af', label: description || t('monitorUnknown') };
  }

  function isFresh(ts, ttlMs) {
    return !!ts && (Date.now() - ts) <= ttlMs;
  }

  function isUiOpen() {
    const root = document.getElementById(ROOT_ID);
    return !!(root && root.classList.contains('open'));
  }

  function shouldRefreshDegraded(force) {
    if (force) return true;
    if (document.hidden) return false;
    if (isUiOpen()) return true;
    const serviceFresh = isFresh(degradedState.service.updatedAt, DEG_STATUS_TTL_MS);
    const ipFresh = isFresh(degradedState.ip.qualityAt, DEG_IP_TTL_MS);
    return !(serviceFresh && ipFresh);
  }

  // ========================== 服务降级监控：业务逻辑 ==========================
  function updateIpHistoryTooltip() {
    const logs = getIPLogs();
    const history = formatIPLogs(logs);
    degradedState.ip.historyTooltip = history ?
      `${t('monitorCopyHistory')}\n${t('monitorCopyHint')}\n---\n${history}` :
      t('monitorIpTip');
  }

  function updateUserTypeFromPersona(userType) {
    const raw = String(userType || '').toLowerCase();
    if (!raw) return;
    const paid = raw.includes('paid') || raw.includes('plus') || raw.includes('pro') || raw.includes('premium');
    degradedState.user.type = raw;
    degradedState.user.paid = paid;
    saveDegradedCache();
  }

  function getIpRiskInfo(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) {
      return { label: t('riskUnknown'), short: t('riskUnknown'), probability: '', color: '#9ca3af', severity: 'na' };
    }
    const labelZh = (text) => text;
    const labelEn = (text) => text;
    if (n <= 10) {
      return { label: lang === 'zh' ? labelZh('极低风险') : labelEn('Very Low'), short: lang === 'zh' ? '极低风险' : 'Very Low', probability: '0%–1%', color: '#22c55e', severity: 'ok' };
    }
    if (n <= 20) {
      return { label: lang === 'zh' ? labelZh('很低风险') : labelEn('Low'), short: lang === 'zh' ? '很低风险' : 'Low', probability: '1%–3%', color: '#84cc16', severity: 'ok' };
    }
    if (n <= 35) {
      return { label: lang === 'zh' ? labelZh('低风险') : labelEn('Lower'), short: lang === 'zh' ? '低风险' : 'Lower', probability: '3%–8%', color: '#a3e635', severity: 'ok' };
    }
    if (n <= 50) {
      return { label: lang === 'zh' ? labelZh('中风险') : labelEn('Medium'), short: lang === 'zh' ? '中风险' : 'Medium', probability: '8%–20%', color: '#f59e0b', severity: 'warn' };
    }
    if (n <= 65) {
      return { label: lang === 'zh' ? labelZh('中高风险') : labelEn('Med-High'), short: lang === 'zh' ? '中高风险' : 'Med-High', probability: '20%–45%', color: '#f97316', severity: 'warn' };
    }
    if (n <= 80) {
      return { label: lang === 'zh' ? labelZh('高风险') : labelEn('High'), short: lang === 'zh' ? '高风险' : 'High', probability: '45%–75%', color: '#ef4444', severity: 'bad' };
    }
    if (n <= 90) {
      return { label: lang === 'zh' ? labelZh('很高风险') : labelEn('Very High'), short: lang === 'zh' ? '很高风险' : 'Very High', probability: '75%–92%', color: '#dc2626', severity: 'bad' };
    }
    return { label: lang === 'zh' ? labelZh('极高风险') : labelEn('Extreme'), short: lang === 'zh' ? '极高风险' : 'Extreme', probability: '92%–99%', color: '#b91c1c', severity: 'bad' };
  }

  // Compact Chinese labels for the top "traffic light" bar to avoid long English strings.
  function compactRiskLabelByScore(score) {
    const info = getIpRiskInfo(score);
    return info.short || info.label || t('riskUnknown');
  }

  function compactRiskLabelByKey(levelKey) {
    const key = String(levelKey || '');
    if (key === 'riskVeryEasy') return '极低';
    if (key === 'riskEasy') return '低';
    if (key === 'riskMedium') return '中';
    if (key === 'riskHard') return '高';
    if (key === 'riskCritical') return '严重';
    return t('riskUnknown');
  }

  function compactServiceLabel(indicator) {
    const ind = String(indicator || '').toLowerCase();
    if (ind === 'none') return '正常';
    if (ind === 'minor') return '轻微';
    if (ind === 'major') return '重大';
    if (ind === 'critical') return '严重';
    return t('monitorUnknown');
  }

  function formatMiniLabel(kind, value) {
    const v = (value == null || value === '') ? '--' : String(value);
    if (lang === 'zh') {
      if (kind === 'service') return `服务·${v}`;
      if (kind === 'ip') return `IP·${v}`;
      if (kind === 'pow') return `PoW·${v}`;
      if (kind === 'opt') return `优化·${v}`;
      return v;
    }
    if (kind === 'service') return `Svc:${v}`;
    if (kind === 'ip') return `IP:${v}`;
    if (kind === 'pow') return `PoW:${v}`;
    if (kind === 'opt') return `Opt:${v}`;
    return v;
  }

  function parseRgbLike(raw) {
    const m = String(raw || '').match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    let body = m[1].trim();
    if (!body) return null;
    if (body.includes('/')) {
      body = body.split('/')[0].trim();
    }
    const parts = body.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const r = Number.parseFloat(parts[0]);
    const g = Number.parseFloat(parts[1]);
    const b = Number.parseFloat(parts[2]);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r, g, b };
  }

  function toRgba(value, alpha) {
    if (!value || typeof value !== 'string') return '';
    let h = value.trim();
    const rgb = parseRgbLike(h);
    if (rgb) return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
    if (!h.startsWith('#')) return '';
    if (h.length === 4) {
      h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
    }
    else if (h.length === 5) {
      h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}${h[4]}${h[4]}`;
    }
    if (h.length === 9) h = h.slice(0, 7);
    if (h.length !== 7) return '';
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return '';
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function paintMiniItem(item, label, color, tooltip, opts = {}) {
    if (!item) return;
    const dot = item.querySelector('.cgpt-vs-miniDot');
    const textEl = item.querySelector('.cgpt-vs-miniText');
    if (label != null && textEl) textEl.textContent = label;
    if (tooltip) item.setAttribute('data-tooltip', tooltip);
    if (!color) {
      item.style.color = '';
      item.style.borderColor = '';
      item.style.background = '';
      item.style.boxShadow = '';
      if (dot) {
        dot.style.background = '';
        dot.style.boxShadow = '';
      }
      return;
    }
    const borderAlpha = Number.isFinite(opts.borderAlpha) ? opts.borderAlpha : 0.62;
    const bgAlpha = Number.isFinite(opts.bgAlpha) ? opts.bgAlpha : 0.24;
    const bgAlpha2 = Number.isFinite(opts.bgAlpha2) ? opts.bgAlpha2 : 0.1;
    const shadowAlpha = Number.isFinite(opts.shadowAlpha) ? opts.shadowAlpha : 0.18;
    const glowAlpha = Number.isFinite(opts.glowAlpha) ? opts.glowAlpha : 0.22;
    const border = toRgba(color, borderAlpha);
    const bgA = toRgba(color, bgAlpha);
    const bgB = toRgba(color, bgAlpha2);
    const shadow = toRgba(color, shadowAlpha);
    item.style.color = opts.textColor || color;
    if (border) item.style.borderColor = border;
    if (bgA || bgB) item.style.background = `linear-gradient(140deg, ${bgA || 'transparent'}, ${bgB || 'transparent'})`;
    if (shadow) item.style.boxShadow = `0 8px 18px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.65)`;
    if (dot) {
      dot.style.background = color;
      const glow = toRgba(color, glowAlpha);
      if (glow) dot.style.boxShadow = `0 0 0 2px ${glow}`;
    }
  }

  function paintDegradedTag(item, color, opts = {}) {
    if (!item) return;
    if (!color) {
      item.style.color = '';
      item.style.borderColor = '';
      item.style.background = '';
      item.style.boxShadow = '';
      item.style.removeProperty('--cgpt-vs-tag-tint');
      return;
    }
    const borderAlpha = Number.isFinite(opts.borderAlpha) ? opts.borderAlpha : 0.55;
    const bgAlpha = Number.isFinite(opts.bgAlpha) ? opts.bgAlpha : 0.22;
    const bgAlpha2 = Number.isFinite(opts.bgAlpha2) ? opts.bgAlpha2 : 0.12;
    const shadowAlpha = Number.isFinite(opts.shadowAlpha) ? opts.shadowAlpha : 0.18;
    const tintAlpha = Number.isFinite(opts.tintAlpha) ? opts.tintAlpha : 0.32;
    const border = toRgba(color, borderAlpha);
    const bgA = toRgba(color, bgAlpha);
    const bgB = toRgba(color, bgAlpha2);
    const shadow = toRgba(color, shadowAlpha);
    const tint = toRgba(color, tintAlpha);
    item.style.color = color;
    if (border) item.style.borderColor = border;
    if (bgA || bgB) item.style.background = `linear-gradient(140deg, ${bgA || 'transparent'}, ${bgB || 'transparent'})`;
    if (shadow) item.style.boxShadow = `0 8px 18px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.65)`;
    if (tint) item.style.setProperty('--cgpt-vs-tag-tint', tint);
  }

  function getMoodLines() {
    return lang === 'zh' ? [
      '慢一点，也是一种前进。',
      '把注意力放在能控制的事上。',
      '风会停，浪也会。',
      '给自己一个暂停键。',
      '今天也辛苦了。',
      '别忘了呼吸。',
      '路远，但一直在靠近。',
      '愿你心里有光。',
      '先完成，再完美。',
      '每一步都算数。'
    ] : [
      'Slow is still forward.',
      'Focus on what you can control.',
      'Waves calm down.',
      'Give yourself a pause.',
      'You did well today.',
      'Remember to breathe.',
      'Keep moving closer.',
      'May you find your light.',
      'Done beats perfect.',
      'Every step counts.'
    ];
  }

  function getDailyMoodIndex(dateKey, total) {
    if (!dateKey || !total) return 0;
    let hash = 0;
    for (let i = 0; i < dateKey.length; i += 1) {
      hash = (hash * 31 + dateKey.charCodeAt(i)) % total;
    }
    return hash % total;
  }

  function updateMoodUI(force) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const el = root.querySelector('#' + MOOD_TEXT_ID);
    if (!el) return;
    const now = Date.now();
    if (!force && moodState.nextAt && now < moodState.nextAt) return;
    const today = getLocalDateKey(new Date());
    const cachedText = localStorage.getItem(MOOD_CACHE_TEXT_KEY) || '';
    const cachedDate = localStorage.getItem(MOOD_CACHE_DATE_KEY) || '';
    if (cachedText && cachedDate === today) {
      el.textContent = cachedText;
      const sub = root.querySelector('#' + MOOD_SUB_ID);
      if (sub) sub.textContent = t('moodSub');
      moodState.nextAt = getNextLocalMidnightMs();
      return;
    }
    const lines = getMoodLines();
    if (!lines.length) return;
    const idx = getDailyMoodIndex(today, lines.length);
    moodState.nextAt = getNextLocalMidnightMs();
    el.textContent = lines[idx];
    const sub = root.querySelector('#' + MOOD_SUB_ID);
    if (sub) sub.textContent = t('moodSub');
  }

  async function refreshMoodFromApi() {
    if (moodState.inFlight) return false;
    const today = getLocalDateKey(new Date());
    const cachedDate = localStorage.getItem(MOOD_CACHE_DATE_KEY) || '';
    if (cachedDate === today && localStorage.getItem(MOOD_CACHE_TEXT_KEY)) return false;
    const attemptDate = localStorage.getItem(MOOD_CACHE_ATTEMPT_KEY) || '';
    if (attemptDate === today) return false;
    moodState.inFlight = true;
    localStorage.setItem(MOOD_CACHE_ATTEMPT_KEY, today);
    try {
      const text = await gmRequestText(MOOD_API_URL, 5000);
      const data = parseJsonTextSafe(text);
      const quote = (data && (data.text || data.data?.text || data.data?.content)) ? String(data.text || data.data?.text || data.data?.content).trim() : '';
      if (quote) {
        localStorage.setItem(MOOD_CACHE_TEXT_KEY, quote);
        localStorage.setItem(MOOD_CACHE_DATE_KEY, today);
        localStorage.setItem(MOOD_CACHE_SOURCE_KEY, 'uapis');
        updateMoodUI(true);
        return true;
      }
    }
    catch {}
    finally {
      moodState.inFlight = false;
    }
    return false;
  }

  function getColumnContentHeight(col, excludeEl) {
    if (!col) return 0;
    const children = Array.from(col.children).filter((el) => el && el.tagName === 'SECTION');
    let total = 0;
    let count = 0;
    for (const el of children) {
      if (excludeEl && el === excludeEl) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.height) continue;
      total += rect.height;
      count += 1;
    }
    if (count > 1) {
      const style = getComputedStyle(col);
      const gapRaw = style.rowGap || style.gap || '0';
      const gap = Number.parseFloat(gapRaw) || 0;
      total += gap * (count - 1);
    }
    return total;
  }

  function placeMoodSection() {
    const root = document.getElementById(ROOT_ID);
    if (!root || !root.classList.contains('open')) return;
    const left = root.querySelector('.cgpt-vs-col-left');
    const right = root.querySelector('.cgpt-vs-col-right');
    const mood = root.querySelector('#' + MOOD_SECTION_ID);
    if (!left || !right || !mood) return;

    if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
      if (mood.parentElement !== left) left.appendChild(mood);
      return;
    }

    const inLeft = left.contains(mood);
    const inRight = right.contains(mood);
    const leftH = getColumnContentHeight(left, inLeft ? mood : null);
    const rightH = getColumnContentHeight(right, inRight ? mood : null);
    const diff = leftH - rightH;
    if (Math.abs(diff) < MOOD_BALANCE_THRESHOLD_PX) return;

    if (diff > 0 && !inRight) right.appendChild(mood);
    else if (diff < 0 && !inLeft) left.appendChild(mood);
  }

  function parseScamalytics(html, ip) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ''), 'text/html');
    const scoreElement = doc.querySelector('.score_bar .score');
    const scoreMatch = scoreElement?.textContent?.match(/Fraud Score:\s*(\d+)/i);
    const score = scoreMatch ? Number(scoreMatch[1]) : null;
    const riskInfo = getIpRiskInfo(score);

    const riskElement = doc.querySelector('.panel_title');
    const panelColor = riskElement?.style?.backgroundColor || '';
    const descriptionElement = doc.querySelector('.panel_body');
    const description = (descriptionElement?.textContent || '').trim();
    const trimmedDescription = description.length > 180 ? `${description.slice(0, 177)}...` : description;

    const extractTableValue = (header) => {
      const row = Array.from(doc.querySelectorAll('th')).find((th) => th.textContent.trim() === header)?.parentElement;
      return row?.querySelector('td')?.textContent.trim() || '';
    };
    const isRiskYes = (header) => {
      const row = Array.from(doc.querySelectorAll('th')).find((th) => th.textContent.trim() === header)?.parentElement;
      return !!row?.querySelector('.risk.yes');
    };

    const city = extractTableValue('City');
    const state = extractTableValue('State / Province');
    const country = extractTableValue('Country Name');
    const isp = extractTableValue('ISP Name');
    const org = extractTableValue('Organization Name');
    const warnings = [];
    if (isRiskYes('Anonymizing VPN')) warnings.push('VPN');
    if (isRiskYes('Tor Exit Node')) warnings.push('Tor');
    if (isRiskYes('Server')) warnings.push('Server');
    if (isRiskYes('Public Proxy') || isRiskYes('Web Proxy') || isRiskYes('Proxy')) warnings.push('Proxy');

    const location = [city, state, country].filter(Boolean).join(', ');
    const label = riskInfo.label || t('riskUnknown');
    const probability = riskInfo.probability || '';
    const color = panelColor || riskInfo.color;
    const tooltipLines = [
      `IP: ${ip}`,
      score == null ? `Risk: ${label}` : `Risk: ${label} (${score}/100)`,
      probability ? (lang === 'zh' ? `风控概率: ${probability}` : `Risk trigger: ${probability}`) : '',
      location ? `Location: ${location}` : '',
      isp ? `ISP: ${isp}${org ? ` (${org})` : ''}` : '',
      warnings.length ? `Warnings: ${warnings.join(', ')}` : '',
      trimmedDescription ? `\n${trimmedDescription}` : '',
      '\nscamalytics.com'
    ].filter(Boolean);

    return {
      score,
      label,
      short: riskInfo.short || label,
      probability,
      color,
      severity: riskInfo.severity,
      tooltip: tooltipLines.join('\n')
    };
  }

  async function refreshServiceStatus(force = false) {
    try {
      if (!shouldRefreshDegraded(force)) return;
      if (!force && isFresh(degradedState.service.updatedAt, DEG_STATUS_REFRESH_MS)) return;
      const text = await gmRequestText('https://status.openai.com/api/v2/summary.json', 4500);
      const data = JSON.parse(text);
      const status = data?.status || {};
      const incidents = Array.isArray(data?.incidents) ? data.incidents : [];
      const incidentSummary = summarizeStatusIncidents(incidents, {
        lang,
        maxItems: 2,
        maxNameLength: lang === 'zh' ? 34 : 64
      });
      const officialDescription = compactSingleLineText(status.description || '', 120);
      const info = getServiceIndicatorInfo(status.indicator, officialDescription || status.description);
      degradedState.service.indicator = String(status.indicator || 'none').toLowerCase();
      degradedState.service.description = info.label;
      degradedState.service.officialDescription = officialDescription || info.label;
      degradedState.service.issueLines = incidentSummary.lines;
      degradedState.service.issueCount = incidentSummary.count;
      degradedState.service.color = info.color;
      degradedState.service.updatedAt = Date.now();
      saveDegradedCache();
      logEvent('debug', 'degraded.status', {
        indicator: degradedState.service.indicator,
        description: degradedState.service.description,
        issueCount: degradedState.service.issueCount
      });
      updateUI();
    }
    catch (err) {
      logEvent('warn', 'degraded.status.fail', { message: err?.message || String(err) });
    }
  }

  async function refreshIPQuality(ip, force = false) {
    if (!ip) return;
    const now = Date.now();
    if (!force && degradedState.ip.qualityIp === ip && (now - degradedState.ip.qualityAt) < (DEG_IP_REFRESH_MS / 2)) return;
    try {
      const html = await gmRequestText(`https://scamalytics.com/ip/${ip}`, 4500);
      const info = parseScamalytics(html, ip);
      degradedState.ip.qualityIp = ip;
      degradedState.ip.qualityAt = now;
      degradedState.ip.qualityScore = info.score;
      degradedState.ip.qualityShort = info.short || info.label;
      degradedState.ip.qualityProbability = info.probability || '';
      const scoreText = info.score == null ? '' : ` (${info.score})`;
      degradedState.ip.qualityLabel = `${info.label}${scoreText}`.trim();
      degradedState.ip.qualityColor = info.color;
      degradedState.ip.qualityTooltip = info.tooltip;
      saveDegradedCache();

      const logs = addIPLog(ip, info.score, degradedState.pow.difficulty || 'N/A');
      if (logs.length) updateIpHistoryTooltip();
      logEvent('debug', 'degraded.ip.quality', {
        ip,
        score: info.score,
        label: info.label
      });
      updateUI();
    }
    catch (err) {
      degradedState.ip.qualityScore = null;
      degradedState.ip.qualityLabel = t('monitorUnknown');
      degradedState.ip.qualityShort = '';
      degradedState.ip.qualityProbability = '';
      degradedState.ip.qualityColor = '#9ca3af';
      degradedState.ip.qualityTooltip = `Scamalytics error: ${err?.message || err}`;
      logEvent('warn', 'degraded.ip.quality.fail', { message: err?.message || String(err) });
      updateUI();
    }
  }

  async function handleIPFetchFailure(error) {
    degradedState.ip.error = error?.message || String(error || '');
    degradedState.ip.masked = 'Failed';
    degradedState.ip.full = '';
    degradedState.ip.warp = 'off';
    degradedState.ip.updatedAt = Date.now();
    degradedState.ip.qualityLabel = 'Error';
    degradedState.ip.qualityShort = '';
    degradedState.ip.qualityProbability = '';
    degradedState.ip.qualityColor = '#ef4444';
    degradedState.ip.qualityTooltip = `${t('monitorIpTip')}\n${degradedState.ip.error}`;
    logEvent('warn', 'degraded.ip.fail', { message: degradedState.ip.error });
    updateUI();
  }

  async function refreshIPInfo(force = false) {
    const now = Date.now();
    if (!shouldRefreshDegraded(force)) return;
    if (degradedState.ip.inFlight) return;
    if (!force && (now - degradedState.ip.lastFetchAt) < DEG_IP_COOLDOWN_MS) return;

    degradedState.ip.inFlight = true;
    degradedState.ip.lastFetchAt = now;

    const services = [
      {
        url: 'https://chatgpt.com/cdn-cgi/trace',
        parse: (text) => parseTrace(text)
      },
      {
        url: 'https://chat.openai.com/cdn-cgi/trace',
        parse: (text) => parseTrace(text)
      },
      {
        url: 'https://www.cloudflare.com/cdn-cgi/trace',
        parse: (text) => parseTrace(text)
      },
      {
        url: 'https://ipinfo.io/json',
        parse: (text) => {
          const data = JSON.parse(text);
          return {
            ip: data.ip || '',
            warp: 'off',
            loc: data.loc || '',
            colo: ''
          };
        }
      }
    ];

    let lastErr = null;
    try {
      for (let i = 0; i < services.length; i += 1) {
        const svc = services[i];
        try {
          const text = await gmRequestText(svc.url, DEG_REQ_TIMEOUT_MS);
          const parsed = svc.parse(text);
          if (!parsed.ip) throw new Error('No IP in response');

          degradedState.ip.full = parsed.ip;
          degradedState.ip.masked = maskIP(parsed.ip);
          degradedState.ip.warp = parsed.warp || 'off';
          degradedState.ip.updatedAt = Date.now();
          degradedState.ip.error = '';
          saveDegradedCache();
          updateIpHistoryTooltip();
          logEvent('debug', 'degraded.ip', { ip: degradedState.ip.masked, warp: degradedState.ip.warp, svc: svc.url });
          updateUI();
          refreshIPQuality(parsed.ip, force);
          return;
        }
        catch (err) {
          lastErr = err;
        }
      }
      handleIPFetchFailure(lastErr || new Error('All IP services failed'));
    }
    finally {
      degradedState.ip.inFlight = false;
    }
  }

  async function refreshPowViaRequirements(force = false) {
    const now = Date.now();
    if (!force && isFresh(degradedState.pow.updatedAt, DEG_POW_TTL_MS)) return false;
    if (!force && (now - degradedState.pow.lastProbeAt) < DEG_POW_PROBE_COOLDOWN_MS) return false;
    degradedState.pow.lastProbeAt = now;

    const urls = [
      '/backend-api/sentinel/chat-requirements',
      '/backend-api/sentinel/requirements',
      '/api/sentinel/chat-requirements',
      '/api/sentinel/requirements'
    ];
    let lastErr = null;

    for (const url of urls) {
      const methods = ['GET', 'POST'];
      for (const method of methods) {
        try {
          const opts = {
            method,
            credentials: 'include',
            headers: {
              'accept': 'application/json'
            }
          };
          if (method === 'POST') {
            opts.headers['content-type'] = 'application/json';
            opts.body = '{}';
          }
          const res = await fetch(url, opts);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await readJsonSafe(res);
          if (!data) throw new Error('Empty JSON');
          const info = findPowDataInJson(data);
          if (info.difficulty) {
            applyPowDifficulty(info.difficulty, 'probe');
            return true;
          }
          if (info.hasHint) {
            applyPowDifficulty('N/A', 'probe.hint');
            return true;
          }
        }
        catch (err) {
          lastErr = err;
        }
      }
    }

    if (force && lastErr) {
      logEvent('debug', 'degraded.pow.probe.fail', { message: lastErr?.message || String(lastErr) });
    }
    return false;
  }

  function isChatRequirementsUrl(url) {
    const u = String(url || '');
    return u.includes('/backend-api/sentinel/chat-requirements') ||
      u.includes('/backend-api/sentinel/requirements') ||
      u.includes('/backend-anon/sentinel/chat-requirements') ||
      u.includes('/backend-anon/sentinel/requirements') ||
      u.includes('/api/sentinel/chat-requirements') ||
      u.includes('/api/sentinel/requirements');
  }

  function handleChatRequirementsResponse(response, resource) {
    const url = getResourceUrl(resource, response);
    if (!isChatRequirementsUrl(url)) return;

    (async () => {
      try {
        if (!response || typeof response.clone !== 'function') return;
        let cloned;
        try {
          cloned = response.clone();
        }
        catch (err) {
          logEvent('debug', 'degraded.chatReq.cloneFail', { message: err?.message || String(err) });
          return;
        }
        const contentType = cloned.headers?.get?.('content-type') || '';
        if (!isJsonContentType(contentType)) return;
        const data = await readJsonSafe(cloned);
        if (!data) return;

        const persona = data?.persona || data?.user_type || data?.account_type;
        if (persona) updateUserTypeFromPersona(persona);

        const powInfo = findPowDataInJson(data);
        if (powInfo.difficulty) {
          applyPowDifficulty(powInfo.difficulty, 'chatReq');
        }
        else if (powInfo.hasHint && !degradedState.pow.updatedAt) {
          applyPowDifficulty('N/A', 'chatReq.hint');
        }
        logEvent('debug', 'degraded.chatReq', {
          difficulty: powInfo.difficulty || (powInfo.hasHint ? 'N/A' : ''),
          persona: persona || ''
        });
      }
      catch (err) {
        logEvent('debug', 'degraded.chatReq.fail', { message: err?.message || String(err) });
      }
    })();
  }

  function findPowDifficultyFromHeaders(headers) {
    if (!headers || typeof headers.get !== 'function') return '';
    const candidates = [
      'x-openai-pow-difficulty',
      'x-openai-proofofwork-difficulty',
      'x-openai-proof-of-work-difficulty',
      'x-openai-proof-of-work',
      'x-openai-pow'
    ];
    for (const key of candidates) {
      const val = normalizePowDifficulty(headers.get(key));
      if (val && isPowDifficultyLike(val)) return val;
    }
    let found = '';
    if (typeof headers.forEach === 'function') {
      headers.forEach((value, key) => {
        if (found) return;
        const k = String(key || '').toLowerCase();
        if (k.includes('pow') || k.includes('proof-of-work') || k.includes('proofofwork')) {
          const val = normalizePowDifficulty(value);
          if (val && isPowDifficultyLike(val)) found = val;
        }
      });
    }
    return found;
  }

  function findPowDifficultyFromHeadersLike(headers) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return findPowDifficultyFromHeaders(headers);
    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (!entry || entry.length < 2) continue;
        const key = String(entry[0] || '').toLowerCase();
        if (!key.includes('pow') && !key.includes('proof-of-work') && !key.includes('proofofwork')) continue;
        const val = normalizePowDifficulty(entry[1]);
        if (val && isPowDifficultyLike(val)) return val;
      }
      return '';
    }
    if (typeof headers === 'object') {
      for (const [keyRaw, valRaw] of Object.entries(headers)) {
        const key = String(keyRaw || '').toLowerCase();
        if (!key.includes('pow') && !key.includes('proof-of-work') && !key.includes('proofofwork')) continue;
        const val = normalizePowDifficulty(valRaw);
        if (val && isPowDifficultyLike(val)) return val;
      }
    }
    return '';
  }

  function handlePowFromHeaders(response) {
    if (!response || !response.headers) return;
    const diff = findPowDifficultyFromHeaders(response.headers);
    if (!diff) return;
    applyPowDifficulty(diff, 'header');
  }

  function handlePowFromXhr(xhr) {
    if (!xhr || typeof xhr.getResponseHeader !== 'function') return;
    const headersShim = {
      get: (key) => xhr.getResponseHeader(key),
      forEach: (cb) => {
        const raw = (typeof xhr.getAllResponseHeaders === 'function') ? xhr.getAllResponseHeaders() : '';
        raw.split(/\r?\n/).forEach((line) => {
          if (!line) return;
          const idx = line.indexOf(':');
          if (idx <= 0) return;
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          cb(v, k);
        });
      }
    };
    const diff = findPowDifficultyFromHeaders(headersShim);
    if (diff) applyPowDifficulty(diff, 'xhr.header');

    try {
      const url = xhr.__cgpt_xhr_url || '';
      const contentType = xhr.getResponseHeader('content-type') || '';
      if (!isJsonContentType(contentType)) return;
      const contentLength = parseContentLength(xhr.getResponseHeader('content-length'));
      if (!shouldParsePowJsonByUrl(url, contentLength)) return;
      const text = xhr.responseText || '';
      if (!text) return;
      const data = parseJsonTextSafe(text);
      if (!data) return;
      const persona = data?.persona || data?.user_type || data?.account_type;
      if (persona) updateUserTypeFromPersona(persona);
      handlePowFromJsonData(data, 'xhr.json');
    }
    catch {}
  }

  async function handlePowFromJsonResponse(response, resource) {
    if (!response || typeof response.clone !== 'function') return;
    const url = getResourceUrl(resource, response);
    const sameOrigin = !url || url.startsWith('/') || url.startsWith(location.origin);
    if (!sameOrigin) return;
    if (isChatRequirementsUrl(url)) return;
    const contentType = response.headers?.get?.('content-type') || '';
    if (!isJsonContentType(contentType)) return;
    const contentLength = parseContentLength(response.headers?.get?.('content-length'));
    if (!shouldParsePowJsonByUrl(url, contentLength)) return;
    let cloned;
    try {
      cloned = response.clone();
    }
    catch {
      return;
    }
    const data = await readJsonSafe(cloned);
    if (!data) return;
    const persona = data?.persona || data?.user_type || data?.account_type;
    if (persona) updateUserTypeFromPersona(persona);
    handlePowFromJsonData(data, 'fetch.json');
  }

  function handlePowFromFetchRequest(resource, init) {
    const headers =
      (init && init.headers) ||
      ((resource && typeof resource === 'object') ? resource.headers : null);
    const diff = findPowDifficultyFromHeadersLike(headers);
    if (diff) applyPowDifficulty(diff, 'fetch.reqHeader');
  }

  function wrapFetch(currentFetch) {
    if (typeof currentFetch !== 'function') return currentFetch;
    if (currentFetch[FETCH_WRAP_KEY]) return currentFetch;

    const wrappedFetch = function () {
      try {
        handlePowFromFetchRequest(arguments[0], arguments[1]);
      }
      catch {}
      const resPromise = currentFetch.apply(this, arguments);
      return resPromise.then((response) => {
        try {
          handleChatRequirementsResponse(response, arguments[0]);
          handlePowFromHeaders(response);
          handlePowFromJsonResponse(response, arguments[0]);
        }
        catch {}
        return response;
      });
    };

    try {
      Object.defineProperty(wrappedFetch, FETCH_WRAP_KEY, {
        value: true,
        configurable: true
      });
    }
    catch {
      wrappedFetch[FETCH_WRAP_KEY] = true;
    }

    return wrappedFetch;
  }

  function ensureFetchHook() {
    const currentFetch = PAGE_WIN.fetch || window.fetch;
    if (typeof currentFetch !== 'function') return false;
    const wrapped = currentFetch[FETCH_WRAP_KEY] ? currentFetch : wrapFetch(currentFetch);
    try {
      PAGE_WIN.fetch = wrapped;
    }
    catch (err) {
      logEvent('debug', 'degraded.fetch.hookFail', { message: err?.message || String(err) });
    }
    try {
      window.fetch = wrapped;
    }
    catch {}
    return !!wrapped;
  }

  function ensureXhrHook() {
    const xhrCtor = PAGE_WIN.XMLHttpRequest || window.XMLHttpRequest;
    const proto = xhrCtor && xhrCtor.prototype;
    if (!proto) return false;
    if (proto[XHR_WRAP_KEY]) return true;

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function () {
      try {
        this.__cgpt_xhr_url = arguments[1];
      }
      catch {}
      return originalOpen.apply(this, arguments);
    };

    proto.send = function () {
      try {
        this.addEventListener('load', () => handlePowFromXhr(this));
      }
      catch {}
      return originalSend.apply(this, arguments);
    };

    try {
      Object.defineProperty(proto, XHR_WRAP_KEY, {
        value: true,
        configurable: true
      });
    }
    catch {
      proto[XHR_WRAP_KEY] = true;
    }
    return true;
  }

  function startFetchMonitor() {
    if (degradedTimers.fetchMonitor) return;
    const startAt = Date.now();
    const tick = () => {
      Monitor.installHooks();
      const elapsed = Date.now() - startAt;
      const delay = elapsed < 60000 ? DEG_FETCH_MONITOR_FAST_MS : DEG_FETCH_MONITOR_SLOW_MS;
      degradedTimers.fetchMonitor = setTimeout(tick, delay);
    };
    tick();
  }

  function startDegradedMonitors() {
    if (degradedStarted) return;
    degradedStarted = true;
    Monitor.installHooks();
    startFetchMonitor();
    Monitor.refreshAll(true, { pow: false });
    degradedTimers.status = setInterval(() => refreshServiceStatus(false), DEG_STATUS_REFRESH_MS);
    degradedTimers.ip = setInterval(() => refreshIPInfo(false), DEG_IP_REFRESH_MS);
  }

  const Monitor = (() => {
    const installHooks = () => {
      ensureFetchHook();
      ensureXhrHook();
    };
    const refreshAll = (force, opts = {}) => {
      const includePow = !!opts.pow;
      installHooks();
      refreshServiceStatus(!!force);
      refreshIPInfo(!!force);
      refreshPowViaRequirements(includePow ? !!force : false);
    };
    return {
      installHooks,
      refreshAll
    };
  })();
  // endregion: Degradation Monitor (network + parsing)

  // region: Health Scoring & Telemetry
  function severityRank(level) {
    if (level === 'bad') return 2;
    if (level === 'warn') return 1;
    if (level === 'ok') return 0;
    return -1;
  }

  function maxSeverity(levels) {
    let best = 'na';
    let bestRank = -1;
    levels.forEach((lv) => {
      const r = severityRank(lv);
      if (r > bestRank) {
        bestRank = r;
        best = lv;
      }
    });
    return best;
  }

  function getDegradedHealth() {
    const serviceSev = isFresh(degradedState.service.updatedAt, DEG_STATUS_TTL_MS) ?
      getServiceIndicatorInfo(degradedState.service.indicator, degradedState.service.description).severity :
      'na';
    const ipSev = isFresh(degradedState.ip.qualityAt, DEG_IP_TTL_MS) ?
      getIpRiskInfo(degradedState.ip.qualityScore).severity :
      'na';
    const powSev = isFresh(degradedState.pow.updatedAt, DEG_POW_TTL_MS) ?
      getPowRiskInfo(degradedState.pow.difficulty).severity :
      'na';
    return {
      severity: maxSeverity([serviceSev, ipSev, powSev]),
      serviceSev,
      ipSev,
      powSev
    };
  }

  function logVirtualizeStats(meta) {
    const now = Date.now();
    const costHot = meta.costMs >= 24;
    const sig = `${meta.turns}|${meta.slimmed}|${meta.marginScreens}|${Math.round(meta.viewportY / 200)}`;
    if (!costHot && sig === lastVirtSig && (now - lastVirtLogAt) < LOG_VIRT_THROTTLE_MS) return;
    lastVirtSig = sig;
    lastVirtLogAt = now;
    logEvent(costHot ? 'warn' : 'debug', 'virtualize', meta);
  }

  function logHealthIfNeeded(info) {
    const now = Date.now();
    const sig = `${info.worst}|${info.memLevel}|${info.domLevel}|${info.turns}|${info.virt}|${info.enabled}|${info.ctrlF}|${info.chatBusy}|${info.autoPause}|${info.degradedSeverity}|${info.serviceSev}|${info.ipSev}|${info.powSev}`;
    const degradedWarnish = (info.degradedSeverity === 'warn' || info.degradedSeverity === 'bad');
    const warnish = (degradedWarnish || info.worst === 'warn' || info.worst === 'bad' || !info.enabled);
    if (sig === lastHealthSig && (!warnish || (now - lastHealthLogAt) < LOG_HEALTH_THROTTLE_MS)) return;
    lastHealthSig = sig;
    lastHealthLogAt = now;
    let level = (info.worst === 'bad') ? 'warn' : (info.worst === 'warn' ? 'info' : 'debug');
    if (info.degradedSeverity === 'bad' && level !== 'warn') level = 'warn';
    else if (info.degradedSeverity === 'warn' && level === 'debug') level = 'info';
    logEvent(level, 'health', info);
  }
  // endregion: Health Scoring & Telemetry

  function setIntrinsicSize(el, height) {
    const h = Math.max(24, Math.round(Number(height) || 0));
    if (!h || !isFinite(h)) return;
    el.style.setProperty('--cgpt-vs-h', `${h}px`);
  }

  function setSlimClass(el, shouldSlim) {
    const has = el.classList.contains(VS_SLIM_CLASS);
    const before = softSlimCount;
    if (shouldSlim && !has) {
      el.classList.add(VS_SLIM_CLASS);
      softSlimCount += 1;
    }
    else if (!shouldSlim && has) {
      el.classList.remove(VS_SLIM_CLASS);
      softSlimCount = Math.max(0, softSlimCount - 1);
    }
    if (softSlimCount !== before) lastVirtualizedCount = softSlimCount;
  }

  function clearSoftSlim() {
    for (const el of softObserved) {
      setSlimClass(el, false);
    }
    softSlimCount = 0;
    lastVirtualizedCount = 0;
  }

  function ensureSoftObserver(marginScreens) {
    if (!useSoftVirtualization) return;
    const scrollInfo = getScrollMetrics();
    const rootEl = scrollInfo.isWindow ? null : scrollInfo.root;
    const baseH = scrollInfo.height || window.innerHeight || 0;
    const marginPx = Math.max(0, Math.round(baseH * marginScreens));
    const margin = `${marginPx}px 0px ${marginPx}px 0px`;
    if (softObserver && softObserverMargin === margin && softObserverRoot === rootEl) return;

    if (softObserver) softObserver.disconnect();
    softObserverMargin = margin;
    softObserverRoot = rootEl;
    softObserver = new IntersectionObserver((entries) => {
      const pausedByChat = autoPauseOnChat && chatBusy;
      const active = virtualizationEnabled && !ctrlFFreeze && !pausedByChat;
      for (const entry of entries) {
        const el = entry.target;
        if (entry.isIntersecting) {
          setIntrinsicSize(el, entry.boundingClientRect.height);
          if (el && el.dataset && el.dataset.vsSlimmed) {
            restoreHardSlim(el);
          }
        }
        if (!virtualizationEnabled || ctrlFFreeze) {
          setSlimClass(el, false);
          continue;
        }
        if (!active) continue;
        setSlimClass(el, !entry.isIntersecting);
      }
      lastVirtualizedCount = softSlimCount;
    }, {
      root: rootEl,
      rootMargin: margin
    });

    for (const el of softObserved) {
      softObserver.observe(el);
    }
  }

  function syncSoftNodes(reason) {
    if (!useSoftVirtualization) return;

    const busy = autoPauseOnChat && updateChatBusy(false);
    if (busy) {
      softSyncDeferred = true;
      return;
    }

    const nodes = getMessageNodes();
    lastTurnsCount = nodes.length;

    const next = new Set(nodes);
    const toRemove = [];
    for (const el of softObserved) {
      if (!next.has(el)) toRemove.push(el);
    }
    if (toRemove.length) {
      for (const el of toRemove) {
        if (softObserver) softObserver.unobserve(el);
        if (el.classList.contains(VS_SLIM_CLASS)) softSlimCount = Math.max(0, softSlimCount - 1);
        softObserved.delete(el);
      }
    }

    for (const el of nodes) {
      if (!softObserved.has(el)) {
        softObserved.add(el);
        if (softObserver) softObserver.observe(el);
      }
    }

    if (!virtualizationEnabled || ctrlFFreeze) {
      clearSoftSlim();
    }
    lastVirtualizedCount = softSlimCount;

    if (reason) {
      logEvent('debug', 'soft.sync', {
        reason,
        nodes: nodes.length,
        slim: softSlimCount
      });
    }
  }

  function scheduleSoftSync(reason) {
    if (!useSoftVirtualization) return;
    const pausedByChat = autoPauseOnChat && chatBusy;
    if (pausedByChat) softSyncDeferred = true;
    if (softSyncPending) return;
    softSyncPending = true;
    if (softSyncTimer) clearTimeout(softSyncTimer);
    const delay = pausedByChat ? SOFT_SYNC_CHAT_DEBOUNCE_MS : SOFT_SYNC_DEBOUNCE_MS;
    softSyncTimer = setTimeout(() => {
      softSyncPending = false;
      if (autoPauseOnChat && chatBusy) {
        softSyncDeferred = true;
        return;
      }
      softSyncDeferred = false;
      syncSoftNodes(reason || (pausedByChat ? 'deferred' : 'debounced'));
    }, delay);
  }

  function findMessageContainer() {
    const first = document.querySelector('div[data-message-id], [data-testid="conversation-turn"]');
    if (first) return first.closest('main') || first.parentElement;
    return document.querySelector('main') || document.body;
  }

  function ensureMessageObserver() {
    if (!useSoftVirtualization) return;
    const container = findMessageContainer();
    if (!container) return;
    if (msgObserver && msgContainer === container) return;

    if (msgObserver) msgObserver.disconnect();
    msgContainer = container;
    scrollRootAt = 0;
    installScrollHook();
    msgObserver = new MutationObserver((mutations) => {
      let hit = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          hit = true;
          break;
        }
        if (m.removedNodes && m.removedNodes.length) {
          hit = true;
          break;
        }
      }
      if (hit) {
        markMsgCacheDirty();
        scheduleSoftSync('mutation');
      }
    });
    msgObserver.observe(container, {
      childList: true,
      subtree: true
    });
  }

  // ========================== 工具函数 ==========================
  function readPersistedRaw(key) {
    const canUseGmStorage =
      (typeof GM_getValue === 'function') &&
      (typeof GM_setValue === 'function');

    let gmValue = null;
    if (canUseGmStorage) {
      try {
        gmValue = GM_getValue(key, null);
      }
      catch {}
    }

    let localValue = null;
    try {
      localValue = localStorage.getItem(key);
    }
    catch {}

    const picked = resolvePersistedRaw({
      gmValue,
      localValue
    });

    if (picked.source === 'local' && canUseGmStorage) {
      try {
        GM_setValue(key, picked.value);
      }
      catch {}
    }
    return picked.value;
  }

  function writePersistedRaw(key, value) {
    const canUseGmStorage =
      (typeof GM_getValue === 'function') &&
      (typeof GM_setValue === 'function');

    const raw = String(value);
    try {
      localStorage.setItem(key, raw);
    }
    catch {}

    if (canUseGmStorage) {
      try {
        GM_setValue(key, raw);
      }
      catch {}
    }
  }

  function loadBool(key, def) {
    const v = readPersistedRaw(key);
    if (v === null || v === undefined) return def;
    if (v === true || v === 1 || v === '1') return true;
    if (v === false || v === 0 || v === '0') return false;
    return def;
  }

  function saveBool(key, val) {
    writePersistedRaw(key, val ? '1' : '0');
  }

  function loadMode() {
    const v = readPersistedRaw(KEY_MODE);
    const normalized = (v == null) ? '' : String(v);
    return (normalized === 'performance' || normalized === 'balanced' || normalized === 'conservative') ? normalized : 'balanced';
  }

  function saveMode(mode) {
    currentMode = mode;
    writePersistedRaw(KEY_MODE, mode);
    markMarginCacheDirty();
    marginCache.overrideUntil = 0;
    marginCache.overrideReason = '';
  }

  function loadPos() {
    try {
      const raw = readPersistedRaw(KEY_POS);
      if (!raw) return {
        x: 18,
        y: 64
      };
      const p = JSON.parse(raw);
      if (typeof p.x === 'number' && typeof p.y === 'number') {
        return {
          x: clamp(p.x, 0, window.innerWidth - 40),
          y: clamp(p.y, 0, window.innerHeight - 40)
        };
      }
    }
    catch {}
    return {
      x: 18,
      y: 64
    };
  }

  function savePos() {
    writePersistedRaw(KEY_POS, JSON.stringify(pinnedPos));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function getTurnCountForMargins() {
    if (!msgCacheDirty && lastTurnsCount) return lastTurnsCount;
    const nodes = getMessageNodes();
    if (nodes && nodes.length) return nodes.length;
    return lastTurnsCount || 0;
  }

  function getMarginShiftByTurns(turns) {
    if (turns < MARGIN_TURN_STEPS[0]) return 1;
    if (turns < MARGIN_TURN_STEPS[1]) return 0;
    if (turns < MARGIN_TURN_STEPS[2]) return -1;
    if (turns < MARGIN_TURN_STEPS[3]) return -2;
    return -3;
  }

  function getNextMarginStep(turns) {
    const t = Math.max(0, Number(turns) || 0);
    for (let i = 0; i < MARGIN_TURN_STEPS.length; i += 1) {
      if (t < MARGIN_TURN_STEPS[i]) return MARGIN_TURN_STEPS[i];
    }
    return null;
  }

  function getOptimizeProfile(mode) {
    return MODE_OPTIMIZE_PROFILES[mode] || MODE_OPTIMIZE_PROFILES.balanced;
  }

  function resolvePressureThresholds(profile) {
    const thresholds = profile?.pressure || {};
    const medium = Number.isFinite(thresholds.medium) ? thresholds.medium : DEFAULT_PRESSURE_THRESHOLDS.medium;
    const high = Number.isFinite(thresholds.high) ? thresholds.high : DEFAULT_PRESSURE_THRESHOLDS.high;
    const critical = Number.isFinite(thresholds.critical) ? thresholds.critical : DEFAULT_PRESSURE_THRESHOLDS.critical;
    return {
      medium,
      high,
      critical
    };
  }

  function resolveDeltaByPressure(profile) {
    const delta = profile?.deltaByPressure || DEFAULT_OPTIMIZE_DELTA_BY_LEVEL;
    return {
      low: Number.isFinite(delta.low) ? delta.low : DEFAULT_OPTIMIZE_DELTA_BY_LEVEL.low,
      medium: Number.isFinite(delta.medium) ? delta.medium : DEFAULT_OPTIMIZE_DELTA_BY_LEVEL.medium,
      high: Number.isFinite(delta.high) ? delta.high : DEFAULT_OPTIMIZE_DELTA_BY_LEVEL.high,
      critical: Number.isFinite(delta.critical) ? delta.critical : DEFAULT_OPTIMIZE_DELTA_BY_LEVEL.critical
    };
  }

  function getAutoOptimizeMinTurns(mode) {
    const profile = getOptimizeProfile(mode);
    const minTurns = Number.isFinite(profile.autoOptimizeMinTurns)
      ? profile.autoOptimizeMinTurns
      : AUTO_OPTIMIZE_MIN_TURNS;
    return Math.max(0, Math.round(minTurns));
  }

  function resolvePressureLevel(profile, key, fallback) {
    const level = profile ? profile[key] : null;
    if (PRESSURE_LEVEL_ORDER[level] == null) return fallback;
    return level;
  }

  function isPressureAtLeast(level, target) {
    const current = PRESSURE_LEVEL_ORDER[level] ?? PRESSURE_LEVEL_ORDER.low;
    const threshold = PRESSURE_LEVEL_ORDER[target] ?? PRESSURE_LEVEL_ORDER.low;
    return current >= threshold;
  }

  function getAutoHardTurnFactor(turns) {
    const t = Math.max(0, Number(turns) || 0);
    for (let i = 0; i < AUTO_HARD_TURN_STEPS.length; i += 1) {
      if (t < AUTO_HARD_TURN_STEPS[i]) return AUTO_HARD_TURN_FACTORS[i];
    }
    return AUTO_HARD_TURN_FACTORS[AUTO_HARD_TURN_FACTORS.length - 1];
  }

  function computeAutoHardThreshold(turns, mode) {
    const base = AUTO_HARD_DOM_THRESHOLD;
    const profile = getOptimizeProfile(mode);
    const modeFactor = Number.isFinite(profile.autoHardFactor) ? profile.autoHardFactor : 1.0;
    const turnFactor = getAutoHardTurnFactor(turns);
    const raw = Math.round(base * modeFactor * turnFactor);
    const min = Math.max(3500, Math.round(DOM_OK * 0.7));
    const max = Math.round(DOM_WARN * 1.4);
    return clamp(raw, min, max);
  }

  function computeAutoHardExit(threshold, mode) {
    const profile = getOptimizeProfile(mode);
    const factor = Number.isFinite(profile.autoHardExitFactor) ? profile.autoHardExitFactor : 0.6;
    const safeThreshold = Number.isFinite(threshold) ? threshold : AUTO_HARD_EXIT_DOM;
    const raw = Math.round(safeThreshold * factor);
    const max = Math.min(AUTO_HARD_EXIT_DOM, Math.max(2600, (safeThreshold - 400)));
    return clamp(raw, 2400, max);
  }

  // DP-based planner: choose soft/hard margins that balance target, stability, and overscan.
  function planMarginsDP(turns, mode, prev) {
    const limits = MODE_MARGIN_LIMITS[mode] || MODE_MARGIN_LIMITS.balanced;
    const baseSoft = MODE_TO_SOFT_MARGIN_SCREENS[mode] ?? MODE_TO_SOFT_MARGIN_SCREENS.balanced;
    const baseHard = MODE_TO_HARD_MARGIN_SCREENS[mode] ?? Math.max(2, baseSoft * 2);
    const shift = getMarginShiftByTurns(turns);
    const desiredSoft = clamp(baseSoft + shift, limits.minSoft, limits.maxSoft);
    const desiredHard = clamp(baseHard + (shift * 2), limits.minHard, limits.maxHard);
    const weights = MODE_PLAN_WEIGHTS[mode] || MODE_PLAN_WEIGHTS.balanced;

    const softCandidates = [];
    for (let s = limits.minSoft; s <= limits.maxSoft; s += 1) softCandidates.push(s);
    const hardCandidates = [];
    for (let h = limits.minHard; h <= limits.maxHard; h += 1) hardCandidates.push(h);

    const prevSoft = prev && typeof prev.soft === 'number' ? prev.soft : desiredSoft;
    const prevHard = prev && typeof prev.hard === 'number' ? prev.hard : desiredHard;

    let best = { soft: desiredSoft, hard: Math.max(desiredHard, desiredSoft + 1) };
    let bestCost = Infinity;
    const turnPenalty = Math.min(1.2, Math.max(0.2, (turns || 0) / 220));

    const dp = [];
    for (const s of softCandidates) {
      let bestHard = null;
      let bestHardCost = Infinity;
      for (const h of hardCandidates) {
        if (h < s + 1) continue;
        const targetCost =
          Math.abs(s - desiredSoft) * weights.soft +
          Math.abs(h - desiredHard) * weights.hard;
        const changeCost =
          (Math.abs(s - prevSoft) + Math.abs(h - prevHard)) * weights.change;
        const overscanCost = (s + h) * weights.overscan * (1 + turnPenalty);
        const cost = targetCost + changeCost + overscanCost;
        if (cost < bestHardCost) {
          bestHardCost = cost;
          bestHard = h;
        }
      }
      dp.push({ soft: s, hard: bestHard, cost: bestHardCost });
    }

    for (const row of dp) {
      if (row.cost < bestCost) {
        bestCost = row.cost;
        best = { soft: row.soft, hard: row.hard };
      }
    }

    if (best.hard < best.soft + 1) best.hard = best.soft + 1;
    return {
      soft: best.soft,
      hard: best.hard,
      desiredSoft,
      desiredHard
    };
  }

  function getHardSliceBudget(remainingRatio, step) {
    const ratio = Math.max(0, Math.min(1, remainingRatio));
    const curve = Math.pow(ratio, 0.6);
    const base = HARD_SLICE_BUDGET_MIN_MS +
      (HARD_SLICE_BUDGET_MAX_MS - HARD_SLICE_BUDGET_MIN_MS) * curve;
    const boost = step <= 2 ? 1.15 : (step <= 4 ? 1.05 : 1);
    return clamp(base * boost, HARD_SLICE_BUDGET_MIN_MS, HARD_SLICE_BUDGET_MAX_MS);
  }

  function getDynamicMargins(force) {
    const now = Date.now();
    const overrideActive = marginCache.overrideUntil && now < marginCache.overrideUntil;
    if (!force && marginCache.mode === currentMode && (overrideActive || (marginCache.at && (now - marginCache.at) < MARGIN_TTL_MS))) {
      return marginCache;
    }
    if (marginCache.overrideUntil && now >= marginCache.overrideUntil) {
      marginCache.overrideUntil = 0;
      marginCache.overrideReason = '';
    }

    const turns = getTurnCountForMargins();
    const prev = marginCache.at ? { soft: marginCache.soft, hard: marginCache.hard } : null;
    const planned = planMarginsDP(turns, currentMode, prev);
    const autoHardDom = computeAutoHardThreshold(turns, currentMode);
    const autoHardExit = computeAutoHardExit(autoHardDom, currentMode);

    marginCache = {
      at: now,
      soft: planned.soft,
      hard: planned.hard,
      desiredSoft: planned.desiredSoft,
      desiredHard: planned.desiredHard,
      autoHardDom,
      autoHardExit,
      turns,
      mode: currentMode,
      overrideUntil: 0,
      overrideReason: ''
    };
    return marginCache;
  }

  function getResourcePressure(domNodes, usedMB, profile) {
    const domRatio = domNodes ? (domNodes / DOM_WARN) : 0;
    const memRatio = (usedMB == null || !isFinite(usedMB)) ? 0 : (usedMB / MEM_WARNING_MB);
    const ratio = Math.max(domRatio, memRatio);
    const thresholds = resolvePressureThresholds(profile);
    let level = 'low';
    if (ratio >= thresholds.critical) level = 'critical';
    else if (ratio >= thresholds.high) level = 'high';
    else if (ratio >= thresholds.medium) level = 'medium';
    return {
      ratio,
      domRatio,
      memRatio,
      level,
      thresholds
    };
  }

  function planOptimizeMargins(domNodes, usedMB) {
    const base = getDynamicMargins(true);
    const profile = getOptimizeProfile(currentMode);
    const pressure = getResourcePressure(domNodes, usedMB, profile);
    const limits = MODE_MARGIN_LIMITS[currentMode] || MODE_MARGIN_LIMITS.balanced;
    const deltaByPressure = resolveDeltaByPressure(profile);
    const delta = Number.isFinite(deltaByPressure[pressure.level]) ? deltaByPressure[pressure.level] : 0;
    let soft = clamp(base.soft + delta, limits.minSoft, limits.maxSoft);
    let hard = clamp(base.hard + (delta * 2), limits.minHard, limits.maxHard);
    if (hard < soft + 1) hard = Math.min(limits.maxHard, soft + 1);
    return {
      base,
      pressure,
      soft,
      hard
    };
  }

  function shouldBypassOptimizeGate(now) {
    if (marginCache.overrideUntil && now < marginCache.overrideUntil) return true;
    return false;
  }

  function isAutoOptimizeReady(turns, mode) {
    const minTurns = getAutoOptimizeMinTurns(mode);
    const turnReady = Number.isFinite(turns) && turns >= minTurns;
    return turnReady;
  }

  function getOptimizeGateStatus(now, turns, domNodes, usedMB) {
    const manualOverride = shouldBypassOptimizeGate(now);
    const loadReady = isAutoOptimizeReady(turns, currentMode);
    const profile = getOptimizeProfile(currentMode);
    let pressureReady = false;
    let pressureLevel = 'na';
    if (!manualOverride && !loadReady) {
      const domAvailable = Number.isFinite(domNodes);
      const memAvailable = Number.isFinite(usedMB);
      if (domAvailable || memAvailable) {
        const pressure = getResourcePressure(
          domAvailable ? domNodes : null,
          memAvailable ? usedMB : null,
          profile
        );
        const gateLevel = resolvePressureLevel(profile, 'gatePressureLevel', 'high');
        pressureReady = isPressureAtLeast(pressure.level, gateLevel);
        pressureLevel = pressure.level;
      }
    }
    return {
      ready: manualOverride || loadReady || pressureReady,
      loadReady,
      manualOverride,
      pressureReady,
      pressureLevel
    };
  }

  function getOptimizeGateStatusByTurns(now, turns, domNodes, usedMB) {
    return getOptimizeGateStatus(now, turns, domNodes, usedMB);
  }

  function setMarginOverridePlan(plan, reason) {
    const now = Date.now();
    const turns = (plan && typeof plan.turns === 'number') ? plan.turns : getTurnCountForMargins();
    const autoHardDom = computeAutoHardThreshold(turns, currentMode);
    const autoHardExit = computeAutoHardExit(autoHardDom, currentMode);
    marginCache = {
      at: now,
      soft: plan.soft,
      hard: plan.hard,
      desiredSoft: plan.desiredSoft ?? plan.soft,
      desiredHard: plan.desiredHard ?? plan.hard,
      autoHardDom,
      autoHardExit,
      turns,
      mode: currentMode,
      overrideUntil: now + OPTIMIZE_PLAN_HOLD_MS,
      overrideReason: reason || ''
    };
  }

  function runAutoOptimize(reason) {
    const domNodes = getDomNodeCount();
    const usedMB = getUsedHeapMB();
    const planned = planOptimizeMargins(domNodes, usedMB);
    const pressure = planned.pressure;
    const profile = getOptimizeProfile(currentMode);
    const hardLevel = resolvePressureLevel(profile, 'hardPressureLevel', 'high');
    const shouldHard = !useSoftVirtualization || isPressureAtLeast(pressure.level, hardLevel);

    virtualizationEnabled = true;
    saveBool(KEY_ENABLED, true);

    if (shouldHard) {
      hardActive = true;
      hardActiveSource = 'auto';
      autoHardBelowAt = 0;
      lastAutoHardAt = Date.now();
    }
    else {
      hardActive = false;
      hardActiveSource = '';
      autoHardBelowAt = 0;
      restoreHardSlimAll();
    }

    setMarginOverridePlan({
      soft: planned.soft,
      hard: planned.hard,
      desiredSoft: planned.base.desiredSoft,
      desiredHard: planned.base.desiredHard,
      turns: planned.base.turns
    }, reason || 'optimize');

    scheduleVirtualize(planned.soft);
    updateUI();
    flashDot();

    logEvent('info', 'optimize.auto', {
      reason: reason || 'manual',
      pressure,
      domNodes,
      memMB: usedMB == null ? null : Number(usedMB.toFixed(1)),
      softScreens: planned.soft,
      hardScreens: planned.hard,
      hardActive: shouldHard
    });
  }

  function getSoftMarginScreens() {
    return getDynamicMargins().soft;
  }

  function getHardMarginScreens() {
    return getDynamicMargins().hard;
  }

  function getUsedHeapMB() {
    const p = window.performance;
    if (!p || !p.memory || !p.memory.usedJSHeapSize) return null;
    return p.memory.usedJSHeapSize / (1024 * 1024);
  }

  function memoryLevel(usedMB) {
    if (usedMB == null) return {
      label: lang === 'zh' ? '不可用' : 'N/A',
      level: 'na'
    };
    if (usedMB < MEM_STABLE_MB) return {
      label: `${usedMB.toFixed(0)}MB${lang === 'zh' ? '（稳定）' : ' (OK)'}`,
      level: 'ok'
    };
    if (usedMB < MEM_WARNING_MB) return {
      label: `${usedMB.toFixed(0)}MB${lang === 'zh' ? '（偏高）' : ' (High)'}`,
      level: 'warn'
    };
    return {
      label: `${usedMB.toFixed(0)}MB${lang === 'zh' ? '（警告）' : ' (Warn)'}`,
      level: 'bad'
    };
  }

  function domLevel(domNodes) {
    if (!Number.isFinite(domNodes) || domNodes <= 0) {
      return {
        label: lang === 'zh' ? '不可用' : 'N/A',
        level: 'na'
      };
    }
    if (domNodes < DOM_OK) return {
      label: `${domNodes}`,
      level: 'ok'
    };
    if (domNodes < DOM_WARN) return {
      label: `${domNodes}`,
      level: 'warn'
    };
    return {
      label: `${domNodes}`,
      level: 'bad'
    };
  }

  function estimateRemainingTurns(usedMB, turns) {
    if (usedMB == null || !turns || turns < 12) return null;
    const avg = usedMB / turns;
    if (!isFinite(avg) || avg <= 0) return null;
    const headroom = MEM_WARNING_MB - usedMB;
    const remaining = Math.floor(headroom / avg);
    return clamp(remaining, 0, 9999);
  }

  function modeLabel(mode) {
    if (lang === 'en') {
      if (mode === 'performance') return 'Performance';
      if (mode === 'balanced') return 'Balanced';
      if (mode === 'conservative') return 'Conservative';
      return 'Balanced';
    }
    if (mode === 'performance') return '性能';
    if (mode === 'balanced') return '平衡';
    if (mode === 'conservative') return '保守';
    return '平衡';
  }

  function suggestionText(domNodes, usedMB, virtCount, turns) {
    const mem = memoryLevel(usedMB).level;
    const dom = domLevel(domNodes).level;

    if (!virtualizationEnabled) {
      return lang === 'zh' ?
        '建议：你已暂停虚拟化。对话会更“完整可见”，但长对话更容易卡顿。需要顺滑时点“启用”。' :
        'Tip: Virtualization is paused. Full history is visible, but long chats may lag. Enable it for smooth scrolling.';
    }

    if (ctrlFFreeze) {
      return lang === 'zh' ?
        '建议：你正在使用浏览器搜索（Ctrl+F），已自动暂停虚拟化以保证能搜到所有历史。结束搜索后会自动恢复。' :
        'Tip: Browser Find (Ctrl+F) is active. Virtualization is paused so you can search all history. It will resume after you exit Find.';
    }

    if (autoPauseOnChat && chatBusy) {
      return lang === 'zh' ?
        '建议：检测到对话进行中，已临时暂停优化以避免干扰回复。对话结束后会自动继续。' :
        'Tip: Chat is active. Optimization is temporarily paused to avoid interference. It will resume automatically after the reply finishes.';
    }

    const degraded = getDegradedHealth();
    if (degraded.severity === 'bad' || degraded.severity === 'warn') {
      const reasons = [];
      if (degraded.serviceSev === 'bad' || degraded.serviceSev === 'warn') reasons.push(t('monitorService'));
      if (degraded.ipSev === 'bad' || degraded.ipSev === 'warn') reasons.push(t('monitorIp'));
      if (degraded.powSev === 'bad' || degraded.powSev === 'warn') reasons.push(t('monitorPow'));
      const reasonText = reasons.join(' / ') || (lang === 'zh' ? '外部状态' : 'external signals');
      if (degraded.severity === 'bad') {
        return lang === 'zh' ?
          `建议：当前${reasonText}偏危险（见下方监控）。优先点“优化”（自动选择软/硬），必要时新开对话或更换网络/IP。` :
          `Tip: ${reasonText} looks risky (see monitor below). Tap “Optimize” (auto soft/hard). If needed, start a new chat or change network/IP.`;
      }
      return lang === 'zh' ?
        `建议：当前${reasonText}偏高（见下方监控）。可继续对话，但若明显变慢，先点“优化”或稍后再试。` :
        `Tip: ${reasonText} is elevated (see monitor below). You can continue, but if it slows down, tap Optimize or wait a bit.`;
    }

    if (mem === 'bad' || dom === 'bad') {
      return lang === 'zh' ?
        '建议：已接近卡顿区。优先点“优化”自动降低负载。重要内容请先备份，再考虑刷新或新开对话。' :
        'Tip: Near lag zone. Tap “Optimize” to auto reduce load. Back up important content before refreshing or starting a new chat.';
    }
    if (mem === 'warn' || dom === 'warn') {
      return lang === 'zh' ?
        '建议：状态偏高但可继续聊。尽量别一次滚很久历史；要翻旧内容可临时切到“保守”。' :
        'Tip: Load is higher but still OK. Avoid long scroll sessions. Switch to “Conservative” when browsing old history.';
    }
    if (virtCount > 0 && turns > 220) {
      return lang === 'zh' ?
        '建议：状态良好。找旧内容尽量用搜索或你自己的工具查看，避免反复拉到最底。' :
        'Tip: Healthy. Use search or your own tools to view old history, instead of repeatedly scrolling to the bottom.';
    }
    return lang === 'zh' ? '建议：状态良好。' : 'Tip: Healthy.';
  }

  // ========================== 选择器：消息节点 ==========================
  function getMessageNodes() {
    const now = Date.now();
    if (useSoftVirtualization && !msgCacheDirty && msgCache.length && msgCacheAt && (now - msgCacheAt) < MSG_CACHE_TTL_MS) {
      return msgCache;
    }

    let nodes = document.querySelectorAll('div[data-message-id]');
    let list = nodes && nodes.length ? Array.from(nodes) : [];

    if (!list.length) {
      nodes = document.querySelectorAll('[data-testid="conversation-turn"]');
      list = nodes && nodes.length ? Array.from(nodes) : [];
    }

    if (!list.length) {
      const main = document.querySelector('main');
      if (!main) {
        msgCache = [];
        msgCacheDirty = false;
        msgCacheAt = now;
        return [];
      }
      nodes = main.querySelectorAll('div[role="presentation"]');
      list = nodes && nodes.length ? Array.from(nodes) : [];
    }

    msgCache = list;
    msgCacheDirty = false;
    msgCacheAt = now;
    return list;
  }

  // region: Virtualization & Interaction
  // ========================== 虚拟化：恢复/清理 ==========================
  function restoreHardSlim(msg) {
    if (!msg || !msg.dataset || !msg.dataset.vsSlimmed) return;
    msg.innerHTML = msg.dataset.vsBackup || msg.innerHTML;
    delete msg.dataset.vsSlimmed;
    delete msg.dataset.vsBackup;
    delete msg.dataset.vsH;
  }

  function applyHardSlim(msg, height) {
    if (!msg || !msg.dataset) return;
    if (!msg.dataset.vsSlimmed) {
      msg.dataset.vsSlimmed = '1';
      msg.dataset.vsBackup = msg.innerHTML;

      const h = Math.max(24, Math.round(Number(height) || 0));
      msg.dataset.vsH = String(h);
      msg.innerHTML = `<div class="cgpt-vs-ph" style="height:${h}px"></div>`;
      return;
    }
    const oldH = Number(msg.dataset.vsH || 0);
    const newH = Math.max(24, Math.round(Number(height) || 0));
    if (oldH && Math.abs(newH - oldH) > 180) {
      msg.dataset.vsH = String(newH);
      const ph = msg.querySelector('.cgpt-vs-ph');
      if (ph) ph.style.height = `${newH}px`;
    }
  }

  function restoreHardSlimAll() {
    const msgs = getMessageNodes();
    for (const msg of msgs) restoreHardSlim(msg);
  }

  function unvirtualizeAll() {
    if (useSoftVirtualization) {
      clearSoftSlim();
    }
    const msgs = getMessageNodes();
    for (const msg of msgs) {
      restoreHardSlim(msg);
    }
  }

  function shouldDeferHardPass(now) {
    if (!useSoftVirtualization) return false;
    if (!lastScrollAt) return false;
    const idleMs = now - lastScrollAt;
    if (idleMs > HARD_SCROLL_IDLE_MS) {
      hardScrollDeferAt = 0;
      return false;
    }
    if (!hardScrollDeferAt) hardScrollDeferAt = now;
    if ((now - hardScrollDeferAt) < HARD_SCROLL_MAX_DEFER_MS) return true;
    hardScrollDeferAt = 0;
    return false;
  }

  function scheduleHardIdlePass() {
    if (hardScrollIdleTimer) clearTimeout(hardScrollIdleTimer);
    hardScrollIdleTimer = setTimeout(() => {
      hardScrollIdleTimer = 0;
      if (!virtualizationEnabled || ctrlFFreeze) return;
      scheduleVirtualize();
    }, HARD_SCROLL_IDLE_MS + 20);
  }

  function getMessageBounds(msg, scrollInfo, rootRect) {
    const rect = msg.getBoundingClientRect();
    const top = scrollInfo.isWindow
      ? (rect.top + window.scrollY)
      : (rect.top - rootRect.top + scrollInfo.root.scrollTop);
    const height = rect.height;
    return {
      top,
      bottom: top + height,
      height
    };
  }

  function isWithinRange(bounds, keepTop, keepBottom) {
    return bounds.bottom > keepTop && bounds.top < keepBottom;
  }

  function virtualizeOnce(marginScreensOverride) {
    const pausedByChat = autoPauseOnChat && updateChatBusy(true);
    if (pausedByChat) {
      hardSliceState.active = false;
      optimizeState.active = false;
      return false;
    }

    const now = Date.now();
    const gateTurns = getTurnsCountCached(false) || lastTurnsCount || 0;
    const gateDomNodes = getDomNodeCount();
    const gateUsedMB = getUsedHeapMB();

    const margins = getDynamicMargins();
    const softMarginScreens = (typeof marginScreensOverride === 'number') ?
      marginScreensOverride :
      margins.soft;
    const hardMarginScreens = margins.hard;

    const shouldHard = !useSoftVirtualization || hardActive;
    if (!shouldHard) {
      if (hardSliceState.active) hardSliceState.active = false;
      optimizeState.active = false;
      const t0 = performance.now();
      const scrollInfo = getScrollMetrics();
      ensureSoftObserver(softMarginScreens);
      ensureMessageObserver();

      if (!virtualizationEnabled || ctrlFFreeze) {
        clearSoftSlim();
        lastVirtualizedCount = 0;
        lastTurnsCount = getTurnsCountCached(true) || 0;
        optimizeState.active = false;
        return;
      }

      const gate = getOptimizeGateStatusByTurns(now, gateTurns, gateDomNodes, gateUsedMB);
      if (!gate.ready) {
        clearSoftSlim();
        restoreHardSlimAll();
        lastVirtualizedCount = 0;
        lastTurnsCount = gateTurns || 0;
        hardSliceState.active = false;
        optimizeState.active = false;
        return;
      }

      scheduleSoftSync('virtualize');
      lastVirtualizedCount = softSlimCount;
      if (!lastTurnsCount) lastTurnsCount = getTurnsCountCached(true) || 0;

      const costMs = Number((performance.now() - t0).toFixed(1));
      logVirtualizeStats({
        turns: lastTurnsCount,
        slimmed: softSlimCount,
        marginScreens: softMarginScreens,
        costMs,
        viewportY: Math.round(scrollInfo.top),
        keepTop: null,
        keepBottom: null,
        mode: 'soft'
      });
      return;
    }

    if (!virtualizationEnabled || ctrlFFreeze) {
      if (useSoftVirtualization) clearSoftSlim();
      restoreHardSlimAll();
      lastVirtualizedCount = 0;
      lastTurnsCount = getTurnsCountCached(true) || 0;
      hardSliceState.active = false;
      optimizeState.active = false;
      return;
    }

    const gate = getOptimizeGateStatusByTurns(now, gateTurns, gateDomNodes, gateUsedMB);
    if (!gate.ready) {
      if (useSoftVirtualization) clearSoftSlim();
      restoreHardSlimAll();
      lastVirtualizedCount = 0;
      lastTurnsCount = gateTurns || 0;
      hardSliceState.active = false;
      optimizeState.active = false;
      return;
    }

    if (useSoftVirtualization) {
      ensureSoftObserver(softMarginScreens);
      ensureMessageObserver();
      scheduleSoftSync('hard');
    }

    const scrollInfo = getScrollMetrics();
    if (hardSliceState.active) {
      const delta = Math.abs(scrollInfo.top - hardSliceState.scrollTop);
      if (delta > (scrollInfo.height * HARD_SLICE_RESTART_RATIO)) {
        hardSliceState.active = false;
      }
      else {
        return;
      }
    }

    if (shouldDeferHardPass(now)) {
      scheduleHardIdlePass();
      setOptimizeActive(false);
      return;
    }
    if (now - lastHardPassAt < HARD_PASS_MIN_MS) return;
    lastHardPassAt = now;

    const t0 = performance.now();

    const msgs = getMessageNodes();
    const turns = msgs.length;
    const viewportTop = scrollInfo.top;
    const viewportBottom = viewportTop + scrollInfo.height;

    const softKeepTop = viewportTop - scrollInfo.height * softMarginScreens;
    const softKeepBottom = viewportBottom + scrollInfo.height * softMarginScreens;
    const hardKeepTop = viewportTop - scrollInfo.height * hardMarginScreens;
    const hardKeepBottom = viewportBottom + scrollInfo.height * hardMarginScreens;
    const rootRect = (!scrollInfo.isWindow && scrollInfo.root) ? scrollInfo.root.getBoundingClientRect() : null;

    // Time-sliced hard virtualization to reduce long main-thread stalls on huge chats.
    if (turns >= HARD_SLICE_TURNS) {
      const token = hardSliceState.token + 1;
      hardSliceState = {
        active: true,
        token,
        index: 0,
        total: turns,
        startAt: t0,
        scrollTop: viewportTop,
        viewportH: scrollInfo.height,
        steps: 0,
        lastStepAt: Date.now(),
        msgs,
        scrollInfo,
        rootRect,
        softKeepTop,
        softKeepBottom,
        hardKeepTop,
        hardKeepBottom,
        softMarginScreens,
        hardMarginScreens,
        hardSlimmedCount: 0,
        nextSoftCount: 0
      };

      const slice = () => {
        if (!hardSliceState.active || hardSliceState.token !== token) return;
        const start = performance.now();
        hardSliceState.steps += 1;
        hardSliceState.lastStepAt = Date.now();
        setOptimizeActive(true);
        const hardSlimTargets = [];
        const hardRestoreTargets = [];
        const softAddTargets = [];
        const softRemoveTargets = [];
        let processed = 0;
        const remaining = Math.max(0, hardSliceState.total - hardSliceState.index);
        const remainingRatio = hardSliceState.total ? (remaining / hardSliceState.total) : 0;
        const budgetMs = getHardSliceBudget(remainingRatio, hardSliceState.steps);

        while (hardSliceState.index < hardSliceState.total) {
          const msg = hardSliceState.msgs[hardSliceState.index];
          hardSliceState.index += 1;
          if (!msg || !msg.getBoundingClientRect) continue;
          processed += 1;
          const bounds = getMessageBounds(msg, hardSliceState.scrollInfo, hardSliceState.rootRect);
          const inHard = isWithinRange(bounds, hardSliceState.hardKeepTop, hardSliceState.hardKeepBottom);

          if (!inHard) {
            if (useSoftVirtualization && msg.classList.contains(VS_SLIM_CLASS)) {
              softRemoveTargets.push(msg);
            }
            hardSlimTargets.push({ msg, height: bounds.height });
            hardSliceState.hardSlimmedCount += 1;
          }
          else {
            if (msg.dataset.vsSlimmed) hardRestoreTargets.push(msg);
            if (useSoftVirtualization) {
              const inSoft = isWithinRange(bounds, hardSliceState.softKeepTop, hardSliceState.softKeepBottom);
              const shouldSoftSlim = !inSoft;
              const hasSoft = msg.classList.contains(VS_SLIM_CLASS);
              if (shouldSoftSlim) {
                hardSliceState.nextSoftCount += 1;
                if (!hasSoft) softAddTargets.push(msg);
              }
              else if (hasSoft) {
                softRemoveTargets.push(msg);
              }
            }
          }

          if (processed >= HARD_SLICE_MAX_ITEMS) break;
          if (processed >= HARD_SLICE_MIN_ITEMS && (performance.now() - start) > budgetMs) break;
        }

        for (const msg of hardRestoreTargets) restoreHardSlim(msg);
        if (useSoftVirtualization) {
          for (const msg of softRemoveTargets) msg.classList.remove(VS_SLIM_CLASS);
        }
        for (const item of hardSlimTargets) applyHardSlim(item.msg, item.height);
        if (useSoftVirtualization) {
          for (const msg of softAddTargets) msg.classList.add(VS_SLIM_CLASS);
        }

        if (hardSliceState.index < hardSliceState.total) {
          markOptimizeWork();
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(slice, { timeout: 200 });
          }
          else {
            setTimeout(slice, 0);
          }
          return;
        }

        const costMs = Number((performance.now() - hardSliceState.startAt).toFixed(1));
        lastTurnsCount = turns;
        if (useSoftVirtualization) softSlimCount = hardSliceState.nextSoftCount;
        lastVirtualizedCount = useSoftVirtualization ? (softSlimCount + hardSliceState.hardSlimmedCount) : hardSliceState.hardSlimmedCount;
        hardSliceState.active = false;
        setOptimizeActive(false);
        logVirtualizeStats({
          turns,
          slimmed: hardSliceState.hardSlimmedCount,
          marginScreens: hardMarginScreens,
          softMarginScreens,
          hardMarginScreens,
          costMs,
          viewportY: Math.round(viewportTop),
          keepTop: Math.round(hardKeepTop),
          keepBottom: Math.round(hardKeepBottom),
          mode: 'hard'
        });
      };

      slice();
      return;
    }

    setOptimizeActive(true);
    let hardSlimmedCount = 0;
    let nextSoftCount = 0;
    const hardSlimTargets = [];
    const hardRestoreTargets = [];
    const softAddTargets = [];
    const softRemoveTargets = [];

    for (const msg of msgs) {
      const bounds = getMessageBounds(msg, scrollInfo, rootRect);
      const inHard = isWithinRange(bounds, hardKeepTop, hardKeepBottom);

      if (!inHard) {
        if (useSoftVirtualization && msg.classList.contains(VS_SLIM_CLASS)) {
          softRemoveTargets.push(msg);
        }
        hardSlimTargets.push({ msg, height: bounds.height });
        hardSlimmedCount += 1;
        continue;
      }

      if (msg.dataset.vsSlimmed) hardRestoreTargets.push(msg);
      if (useSoftVirtualization) {
        const inSoft = isWithinRange(bounds, softKeepTop, softKeepBottom);
        const shouldSoftSlim = !inSoft;
        const hasSoft = msg.classList.contains(VS_SLIM_CLASS);
        if (shouldSoftSlim) {
          nextSoftCount += 1;
          if (!hasSoft) softAddTargets.push(msg);
        }
        else if (hasSoft) {
          softRemoveTargets.push(msg);
        }
      }
    }

    // Batch DOM writes after all reads to avoid layout thrash.
    for (const msg of hardRestoreTargets) restoreHardSlim(msg);
    if (useSoftVirtualization) {
      for (const msg of softRemoveTargets) msg.classList.remove(VS_SLIM_CLASS);
    }
    for (const item of hardSlimTargets) applyHardSlim(item.msg, item.height);
    if (useSoftVirtualization) {
      for (const msg of softAddTargets) msg.classList.add(VS_SLIM_CLASS);
    }

    const costMs = Number((performance.now() - t0).toFixed(1));
    lastTurnsCount = turns;
    if (useSoftVirtualization) softSlimCount = nextSoftCount;
    lastVirtualizedCount = useSoftVirtualization ? (softSlimCount + hardSlimmedCount) : hardSlimmedCount;
    setOptimizeActive(false);
    logVirtualizeStats({
      turns,
      slimmed: hardSlimmedCount,
      marginScreens: hardMarginScreens,
      softMarginScreens,
      hardMarginScreens,
      costMs,
      viewportY: Math.round(viewportTop),
      keepTop: Math.round(hardKeepTop),
      keepBottom: Math.round(hardKeepBottom),
      mode: 'hard'
    });
  }

  function scheduleVirtualize(marginOverride) {
    const now = Date.now();
    const pausedByChat = autoPauseOnChat && chatBusy;
    if (pausedByChat) {
      virtualizeDeferred = true;
      if (typeof marginOverride === 'number') pendingVirtualizeMargin = marginOverride;
      return;
    }
    if (shouldYieldToInput(now)) {
      virtualizeDeferred = true;
      if (typeof marginOverride === 'number') pendingVirtualizeMargin = marginOverride;
      scheduleDeferredVirtualize((inputYieldUntil - now) + 20);
      return;
    }
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (virtualizeDeferred) {
        virtualizeDeferred = false;
        pendingVirtualizeMargin = null;
      }
      const paused = virtualizeOnce(marginOverride) === false;
      if (!paused) updateUI();
    });
  }

  // ========================== Ctrl+F 兼容 ==========================
  function enableCtrlFFreeze() {
    if (ctrlFFreeze) return;
    ctrlFFreeze = true;
    unvirtualizeAll();
    updateUI();
    logEvent('info', 'ctrlF.on', {
      turns: getMessageNodes().length || 0
    });
  }

  function disableCtrlFFreeze() {
    if (!ctrlFFreeze) return;
    ctrlFFreeze = false;
    scheduleVirtualize();
    logEvent('info', 'ctrlF.off');
  }

  function installFindGuards() {
    window.addEventListener('keydown', (e) => {
      const isFind = ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F'));
      if (isFind) enableCtrlFFreeze();
      if (e.key === 'Escape') setTimeout(() => disableCtrlFFreeze(), 120);
    }, true);
  }

  // ========================== 输入淡出 ==========================
  function installTypingDim() {
    const dim = () => {
      lastInputAt = Date.now();
      markInputYield(INPUT_OPTIMIZE_GRACE_MS);
      const root = ensureRoot();
      root.classList.add('dim');
      if (typingDimTimer) clearTimeout(typingDimTimer);
      typingDimTimer = setTimeout(() => {
        const idle = Date.now() - lastInputAt;
        if (idle >= INPUT_DIM_IDLE_MS) root.classList.remove('dim');
      }, INPUT_DIM_IDLE_MS + 20);
    };

    document.addEventListener('input', (e) => {
      if (!e || !e.target) return;
      const el = e.target;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input') dim();
    }, true);

    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!el) return;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input') dim();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (!e || !e.target) return;
      const el = e.target;
      const tag = (el.tagName || '').toLowerCase();
      if (tag !== 'textarea' && tag !== 'input') return;
      if (e.key !== 'Enter' || e.shiftKey) return;
      markInputYield(INPUT_OPTIMIZE_GRACE_MS + 220);
    }, true);

    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const root = ensureRoot();
        root.classList.remove('dim');
      }, 220);
    }, true);
  }

  // ========================== 图片加载后补一次 ==========================
  function installImageLoadHook() {
    window.addEventListener('load', (e) => {
      const t = e && e.target;
      if (t && t.tagName && t.tagName.toLowerCase() === 'img') {
        if (useSoftVirtualization) {
          const msg = t.closest('div[data-message-id], [data-testid="conversation-turn"], div[role="presentation"]');
          if (msg) {
            setIntrinsicSize(msg, msg.getBoundingClientRect().height);
          }
        }
        setTimeout(() => scheduleVirtualize(), IMAGE_LOAD_RETRY_MS);
      }
    }, true);
  }

  // ========================== Resize 修复 ==========================
  function installResizeFix() {
    window.addEventListener('resize', () => {
      unvirtualizeAll();
      requestAnimationFrame(() => scheduleVirtualize());
      logEvent('debug', 'resize', {
        w: window.innerWidth,
        h: window.innerHeight
      });
    }, {
      passive: true
    });
  }

  // ========================== 跟随“模型切换按钮”定位 ==========================
  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  function getMainContentLeft() {
    const main = document.querySelector('main');
    if (main) {
      const rect = main.getBoundingClientRect();
      if (rect.width && rect.right > rect.left) return rect.left;
    }
    const mainLike = document.querySelector('[data-testid="conversation"], [data-testid="chat-view"], [data-testid="app-main"]');
    if (mainLike) {
      const rect = mainLike.getBoundingClientRect();
      if (rect.width && rect.right > rect.left) return rect.left;
    }
    let sidebarRight = 0;
    document.querySelectorAll('nav, aside, [data-testid*="sidebar"], [data-testid*="left-rail"], [data-testid*="navigation"]').forEach((el) => {
      if (!isElementVisible(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.right > sidebarRight) sidebarRight = rect.right;
    });
    return sidebarRight ? (sidebarRight + 1) : 0;
  }

  function getElementLabel(el) {
    if (!el) return '';
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    if (label) return label;
    return (el.textContent || '').trim();
  }

  function isLikelyModelLabel(text) {
    if (!text) return false;
    const t = text.trim();
    if (!t || t.length > 120) return false;
    return /gpt|chatgpt|model|模型|语音|voice|4o|o1|o3|o4|mini|turbo|preview|pro|builder|prompt|\d+\.\d+/i.test(t);
  }

  function resolveButtonCandidate(el) {
    if (!el) return null;
    if (el.closest && el.closest('#' + ROOT_ID)) return null;
    const role = (el.getAttribute('role') || '').toLowerCase();
    const typeAttr = (el.getAttribute('type') || '').toLowerCase();
    const hasMenu = (el.getAttribute('aria-haspopup') || '').toLowerCase() === 'menu';
    if (el.tagName === 'BUTTON' || role === 'button' || typeAttr === 'button' || hasMenu) return el;
    const inner = el.querySelector ? el.querySelector('button, [role="button"]') : null;
    return inner || null;
  }

  function hasVersionLikeText(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t) return false;
    return /\b\d+\.\d+\b|(?:^|\s)(?:o1|o3|o4|4o|mini|turbo|preview|pro)(?:\s|$)/i.test(t);
  }

  function hasHeaderStyleSignal(el) {
    if (!el) return false;
    const cls = String(el.className || '');
    if (!/\btext-lg\b/.test(cls)) return false;
    return /\bpx-2\.5\b|\bwhitespace-nowrap\b|\brounded-lg\b|\bfont-normal\b/.test(cls);
  }

  function hasModelAnchorAttributes(el) {
    if (!el) return false;
    const dataTestId = String(el.getAttribute('data-testid') || '').toLowerCase();
    const aria = String(el.getAttribute('aria-label') || '').toLowerCase();
    return dataTestId.includes('model-switcher') ||
      dataTestId.includes('model-switch') ||
      aria.includes('模型选择器') ||
      aria.includes('当前模型') ||
      aria.includes('model selector') ||
      aria.includes('current model');
  }

  function hasAnchorSignalText(text) {
    if (!text) return false;
    return /chatgpt|gpt|模型|model|语音|voice/i.test(text) || hasVersionLikeText(text);
  }

  function scoreModelCandidate(el, mainLeft) {
    if (!isElementVisible(el)) return Infinity;
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 4) return Infinity;
    if (rect.top > (window.innerHeight * FOLLOW_BOTTOM_ZONE_RATIO)) return Infinity;
    if (rect.top > 220) return Infinity;
    if (mainLeft && rect.right < (mainLeft - 8)) return Infinity;
    if (el.closest && el.closest('nav, aside, [data-testid*="sidebar"], [data-testid*="left-rail"]')) return Infinity;

    const label = getElementLabel(el);
    const hasMenu = (el.getAttribute('aria-haspopup') || '').toLowerCase() === 'menu';
    const hasState = !!el.getAttribute('data-state');
    const hasRadixId = /^radix[-_]/i.test(String(el.id || ''));
    const hasModelAttrs = hasModelAnchorAttributes(el);
    const hasSignalText = hasAnchorSignalText(label);
    const hasVoiceLabel = /chatgpt\s*语音|语音|voice/i.test(label);
    const hasVersion = hasVersionLikeText(label);
    const hasHeaderStyle = hasHeaderStyleSignal(el);
    const strongSignal = hasModelAttrs || hasVoiceLabel || (hasMenu && (hasSignalText || hasVersion));
    if (!strongSignal) return Infinity;

    let score = (rect.top * 7) + rect.left;
    if (el.closest && el.closest('header')) score -= 220;
    if (el.closest && el.closest('main')) score -= 100;
    if (el.tagName === 'BUTTON') score -= 50;
    if (hasModelAttrs) score -= 1100;
    if (hasMenu) score -= 260;
    if (hasState) score -= 80;
    if (hasRadixId) score -= 120;
    if (hasVersion) score -= 180;
    if (hasSignalText) score -= 180;
    if (hasVoiceLabel) score -= 260;
    if (hasHeaderStyle) score -= 80;
    if (el.querySelector && el.querySelector('svg')) score -= 40;
    if (rect.top > 150) score += 240;
    if (rect.width > 620 || rect.height > 120) score += 320;
    if (String(label || '').length > 120) score += 240;
    return score;
  }

  function pickBestModelCandidate(list, mainLeft) {
    const seen = new Set();
    let best = null;
    let bestScore = Infinity;
    const ml = (typeof mainLeft === 'number') ? mainLeft : getMainContentLeft();
    for (const item of list) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      const score = scoreModelCandidate(item, ml);
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  }

  function collectModelButtonCandidates(mainLeft) {
    const ml = (typeof mainLeft === 'number') ? mainLeft : getMainContentLeft();
    const selectors = [
      'button[data-testid="model-switcher-dropdown-button"]',
      '[data-testid*="model-switcher"]',
      '[data-testid*="model-switch"]',
      'button[aria-label*="模型选择器"]',
      'button[aria-label*="当前模型"]',
      'button[aria-label*="model selector" i]',
      'button[aria-label*="current model" i]',
      '[aria-haspopup="menu"][data-state][id^="radix-"]',
      '[aria-haspopup="menu"][data-state]',
      '[data-testid*="model"]',
      'button[aria-label*="Model"]',
      'button[aria-label*="模型"]',
      'button[title*="Model"]',
      'button[title*="模型"]',
      '[role="button"][aria-label*="Model"]',
      '[role="button"][aria-label*="模型"]'
    ];
    const candidates = [];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        const btn = resolveButtonCandidate(el);
        if (!btn) return;
        if (!isElementVisible(btn)) return;
        const rect = btn.getBoundingClientRect();
        if (rect.top > 220) return;
        if (ml && btn.getBoundingClientRect().right < (ml - 6)) return;
        candidates.push(btn);
      });
    });
    return candidates;
  }

  function collectTopBarTextCandidates(mainLeft) {
    const ml = (typeof mainLeft === 'number') ? mainLeft : getMainContentLeft();
    const topLimit = 220;
    const list = [];
    document.querySelectorAll(
      'button, [role="button"], [aria-haspopup="menu"][data-state], [aria-haspopup="menu"][id^="radix-"]'
    ).forEach((el) => {
      if (!isElementVisible(el)) return;
      if (el.closest && el.closest('#' + ROOT_ID)) return;
      if (el.closest && el.closest('nav, aside')) return;
      const rect = el.getBoundingClientRect();
      if (rect.top > topLimit) return;
      if (ml && rect.right < (ml - 6)) return;
      const label = getElementLabel(el);
      if (!label) return;
      const hasMenu = (el.getAttribute('aria-haspopup') || '').toLowerCase() === 'menu';
      const hasModelAttrs = hasModelAnchorAttributes(el);
      if (!(hasModelAttrs || (hasMenu && hasAnchorSignalText(label)) || /chatgpt\s*语音|语音|voice/i.test(label))) return;
      list.push(el);
    });
    return list;
  }

  function collectModelLabelAnchors(mainLeft) {
    const ml = (typeof mainLeft === 'number') ? mainLeft : getMainContentLeft();
    const selectors = [
      'main h1',
      'main h2',
      'main h3',
      'main [role="heading"]',
      'main [data-testid*="title"]',
      'main [data-testid*="model"]',
      'header h1',
      'header h2',
      'header h3',
      'header [role="heading"]',
      'header [data-testid*="title"]',
      'header [data-testid*="model"]',
      'main .text-lg',
      'header .text-lg'
    ];
    const list = [];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!isElementVisible(el)) return;
        if (el.closest && el.closest('#' + ROOT_ID)) return;
        if (el.closest && el.closest('nav, aside')) return;
        const rect = el.getBoundingClientRect();
        if (rect.top > 160 || rect.height > 80) return;
        if (ml && rect.right < (ml - 6)) return;
        const label = getElementLabel(el);
        if (!isLikelyModelLabel(label)) return;
        if (sel.includes('.text-lg') && !hasHeaderStyleSignal(el)) return;
        list.push(el);
      });
    });
    return list;
  }

  function findModelButton() {
    const now = Date.now();
    if (modelBtnCache.el && (now - modelBtnCache.at) < MODEL_BTN_TTL_MS) {
      if (isElementVisible(modelBtnCache.el)) return modelBtnCache.el;
    }

    const mainLeft = getMainContentLeft();
    const candidates = collectModelButtonCandidates(mainLeft)
      .concat(collectTopBarTextCandidates(mainLeft))
      .concat(collectModelLabelAnchors(mainLeft));
    const best = pickBestModelCandidate(candidates, mainLeft);
    if (best && scoreModelCandidate(best, mainLeft) <= MODEL_CANDIDATE_MAX_SCORE) {
      modelBtnCache = { el: best, at: now };
      return best;
    }
    modelBtnCache = { el: null, at: now };
    return null;
  }

  function findVoiceActionButton(mainLeft) {
    const ml = (typeof mainLeft === 'number') ? mainLeft : getMainContentLeft();
    const minTop = Math.round(window.innerHeight * FOLLOW_BOTTOM_ZONE_RATIO);
    let best = null;
    let bestScore = Infinity;
    document.querySelectorAll('button, [role="button"]').forEach((el) => {
      if (!isElementVisible(el)) return;
      if (el.closest && el.closest('#' + ROOT_ID)) return;
      if (el.closest && el.closest('nav, aside')) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < minTop) return;
      if (ml && rect.right < (ml - 6)) return;
      const label = getElementLabel(el);
      if (!label) return;
      if (!/(结束语音|语音结束|结束通话|结束|end voice|leave voice|hang up|\bend\b)/i.test(label)) return;
      const score = Math.abs(window.innerHeight - rect.bottom) * 3 +
        Math.abs((window.innerWidth - 120) - rect.right);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    });
    return best;
  }

  function normalizeComposerAnchor(el) {
    if (!el) return null;
    const tag = (el.tagName || '').toLowerCase();
    const editable = el.getAttribute && el.getAttribute('contenteditable');
    if (tag === 'textarea' || tag === 'input' || editable === 'true') {
      const host = el.closest('form, [data-testid*="composer"], [data-testid*="chat-input"], [data-testid*="message-composer"], [class*="composer"]');
      return host || el;
    }
    return el;
  }

  function scoreComposerCandidate(el, mainLeft) {
    if (!isElementVisible(el)) return Infinity;
    const rect = el.getBoundingClientRect();
    if (rect.top < (window.innerHeight * FOLLOW_BOTTOM_ZONE_RATIO)) return Infinity;
    let score = Math.abs(window.innerHeight - rect.bottom) * 2 +
      Math.abs(rect.left - Math.max(0, Number(mainLeft) || 0));
    if (mainLeft && rect.right < (mainLeft - 6)) score += 1400;
    if (rect.width < 220) score += 160;
    if (rect.width > (window.innerWidth * 0.48)) score -= 80;
    return score;
  }

  function findComposerAnchor(mainLeft) {
    const ml = (typeof mainLeft === 'number') ? mainLeft : getMainContentLeft();
    const selectors = [
      '#prompt-textarea',
      'textarea[data-testid*="prompt"]',
      '[data-testid*="composer"] textarea',
      '[data-testid*="chat-input"] textarea',
      'main textarea',
      'main [contenteditable="true"]',
      '[data-testid*="composer"]',
      '[data-testid*="chat-input"]',
      '[data-testid*="message-composer"]',
      'main form'
    ];
    const seen = new Set();
    let best = null;
    let bestScore = Infinity;
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((node) => {
        const el = normalizeComposerAnchor(node);
        if (!el || seen.has(el)) return;
        seen.add(el);
        if (el.closest && el.closest('#' + ROOT_ID)) return;
        if (el.closest && el.closest('nav, aside')) return;
        const score = scoreComposerCandidate(el, ml);
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      });
    });
    return best;
  }

  function resolveFollowAnchor() {
    const mainLeft = getMainContentLeft();
    const modelButton = findModelButton();
    if (modelButton) {
      return {
        element: modelButton,
        kind: 'model',
        mainLeft
      };
    }
    return {
      element: null,
      kind: 'fallback',
      mainLeft
    };
  }

  function positionNearModelButton() {
    const root = ensureRoot();
    if (pinned) return;

    const rootRect = root.getBoundingClientRect();
    const rootW = Math.max(200, Math.round(rootRect.width || 0));
    const rootH = Math.max(24, Math.round(rootRect.height || 0));
    const anchor = resolveFollowAnchor();
    if (!anchor.element) {
      const fallbackX = anchor.mainLeft
        ? Math.round(anchor.mainLeft + FOLLOW_ANCHOR_GAP_PX)
        : 12;
      root.style.left = `${clamp(fallbackX, 6, window.innerWidth - rootW - 6)}px`;
      root.style.top = `${clamp(10 + FLOAT_Y_OFFSET_PX, 6, window.innerHeight - rootH - 6)}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
      root.classList.add('fallback');
      root.setAttribute('data-follow-anchor', 'fallback');
      return;
    }

    const r = anchor.element.getBoundingClientRect();
    let x = 0;
    let y = 0;
    if (anchor.kind === 'model') {
      x = Math.round(r.right + FOLLOW_ANCHOR_GAP_PX);
      const leftX = Math.round(r.left - rootW - FOLLOW_ANCHOR_GAP_PX);
      if ((x + rootW > window.innerWidth - 6) && leftX >= 6) {
        x = leftX;
      }
      const baseY = Math.round(r.top + (r.height - rootH) / 2);
      y = Math.max(6, baseY + FLOAT_Y_OFFSET_PX);
    }
    else {
      const xPrimary = Math.round(r.left);
      const xRightAligned = Math.round(r.right - rootW);
      x = xPrimary;
      if ((x + rootW > window.innerWidth - 6) && xRightAligned >= 6) {
        x = xRightAligned;
      }
      const upY = Math.round(r.top - rootH - FOLLOW_ANCHOR_GAP_PX + FLOAT_Y_OFFSET_PX);
      const downY = Math.round(r.bottom + FOLLOW_ANCHOR_GAP_PX + FLOAT_Y_OFFSET_PX);
      y = (upY >= 6) ? upY : downY;
    }

    root.style.left = `${clamp(x, 6, window.innerWidth - rootW - 6)}px`;
    root.style.top = `${clamp(y, 6, window.innerHeight - rootH - 6)}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';

    root.classList.remove('fallback');
    root.setAttribute('data-follow-anchor', anchor.kind);
  }

  function startFollowPositionLoop() {
    stopFollowPositionLoop();
    if (pinned) return;
    const tick = () => {
      if (pinned) {
        stopFollowPositionLoop();
        return;
      }
      const root = ensureRoot();
      const open = root.classList.contains('open');
      positionNearModelButton();
      followTimer = setTimeout(tick, open ? POS_FOLLOW_WHEN_OPEN_MS : POS_FOLLOW_MS);
    };
    tick();
  }

  function stopFollowPositionLoop() {
    if (followTimer) clearTimeout(followTimer);
    followTimer = null;
  }

  function isElementEffectivelyVisible(el) {
    if (!el || !el.isConnected) return false;
    let node = el;
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (node === el && style.opacity === '0') return false;
      node = node.parentElement;
    }
    const rect = el.getBoundingClientRect();
    return !!(rect.width > 0 && rect.height > 0);
  }

  function readNumericZIndex(el) {
    if (!el) return null;
    const raw = Number.parseFloat(getComputedStyle(el).zIndex);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.floor(raw);
  }

  function isOwnOverlayNode(el) {
    if (!el || !el.closest) return false;
    return !!(el.closest('#' + ROOT_ID) || el.closest('#' + HELP_ID));
  }

  function isKeepOverlayNode(el) {
    if (!el) return false;
    if (el.matches && el.matches('.kmenu, .kmenu-panel, .kdialog-overlay, .kdialog-shell, #kcg, #xcanwin')) return true;
    return !!(el.closest && el.closest('.kmenu, .kdialog-overlay, .kdialog-shell'));
  }

  function collectVisibleZIndices(nodes) {
    const zIndices = [];
    (nodes || []).forEach((el) => {
      if (!isElementEffectivelyVisible(el)) return;
      const z = readNumericZIndex(el);
      if (Number.isFinite(z)) zIndices.push(z);
    });
    return zIndices;
  }

  function getKeepLayerOverlayInfo() {
    const overlays = [];
    document.querySelectorAll('.kmenu.kshow, .kdialog-overlay').forEach((el) => {
      overlays.push(el);
    });
    if (document.body && document.body.classList.contains('kmenu-open')) {
      const menuRoot = document.querySelector('.kmenu');
      if (menuRoot) overlays.push(menuRoot);
    }
    return {
      active: overlays.some((el) => isElementEffectivelyVisible(el)),
      overlays,
      zIndices: collectVisibleZIndices(overlays)
    };
  }

  function getGenericLayerOverlayInfo() {
    const overlays = [];
    document.querySelectorAll('dialog[open], [aria-modal="true"]').forEach((el) => {
      if (isOwnOverlayNode(el)) return;
      if (isKeepOverlayNode(el)) return;
      if (!isElementEffectivelyVisible(el)) return;
      overlays.push(el);
    });
    return {
      active: overlays.length > 0,
      overlays,
      zIndices: collectVisibleZIndices(overlays)
    };
  }

  function applyUiLayerZIndex(zIndex) {
    const root = document.getElementById(ROOT_ID);
    const help = document.getElementById(HELP_ID);
    if (root) {
      if (zIndex >= LAYER_Z_NORMAL) root.style.removeProperty('z-index');
      else root.style.zIndex = String(zIndex);
    }
    if (help) {
      if (zIndex >= LAYER_Z_NORMAL) help.style.removeProperty('z-index');
      else help.style.zIndex = String(zIndex);
    }
  }

  function syncUiLayerPriority(force) {
    const keepInfo = getKeepLayerOverlayInfo();
    const genericInfo = getGenericLayerOverlayInfo();
    const mode = resolveLayerYieldMode({
      scope: LAYER_COMPAT_SCOPE,
      keepActive: keepInfo.active,
      genericActive: genericInfo.active
    });

    let nextZ = LAYER_Z_NORMAL;
    if (mode === 'keep') {
      nextZ = resolveLayerYieldZIndex({
        overlayZIndices: keepInfo.zIndices,
        fallbackZIndex: LAYER_Z_KEEP_FALLBACK,
        minZIndex: LAYER_Z_MIN
      });
    }
    else if (mode === 'generic') {
      nextZ = resolveLayerYieldZIndex({
        overlayZIndices: genericInfo.zIndices,
        fallbackZIndex: LAYER_Z_GENERIC_FALLBACK,
        minZIndex: LAYER_Z_MIN
      });
    }
    nextZ = Math.max(LAYER_Z_MIN, Math.min(LAYER_Z_NORMAL, Math.floor(Number(nextZ) || LAYER_Z_NORMAL)));

    if (!force && layerYieldMode === mode && layerYieldZIndex === nextZ) return;
    layerYieldMode = mode;
    layerYieldZIndex = nextZ;
    applyUiLayerZIndex(nextZ);

    logEvent('debug', 'layer.sync', {
      mode,
      zIndex: nextZ,
      keepOverlays: keepInfo.overlays.length,
      genericOverlays: genericInfo.overlays.length
    });
  }

  function scheduleLayerSync() {
    if (layerSyncPending) return;
    layerSyncPending = true;
    requestAnimationFrame(() => {
      layerSyncPending = false;
      syncUiLayerPriority(false);
    });
  }

  function startLayerPrioritySync() {
    if (layerSyncObserver) return;
    const root = document.body || document.documentElement;
    if (!root) return;
    layerSyncObserver = new MutationObserver(() => {
      scheduleLayerSync();
    });
    layerSyncObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'open', 'aria-hidden']
    });
    if (layerSyncTimer) clearInterval(layerSyncTimer);
    layerSyncTimer = setInterval(() => syncUiLayerPriority(false), LAYER_SYNC_MS);
    syncUiLayerPriority(true);
  }

  // ========================== UI：主题适配 ==========================
  function isDarkTheme() {
    const docEl = document.documentElement;
    const body = document.body;
    const docTheme = (docEl.getAttribute('data-theme') || '').toLowerCase();
    const bodyTheme = body ? (body.getAttribute('data-theme') || '').toLowerCase() : '';
    return docEl.classList.contains('dark') ||
      (body && body.classList.contains('dark')) ||
      docTheme === 'dark' ||
      bodyTheme === 'dark';
  }

  function applyThemeClass() {
    const dark = isDarkTheme();
    const root = document.getElementById(ROOT_ID);
    const help = document.getElementById(HELP_ID);
    if (root) root.classList.toggle('theme-dark', dark);
    if (help) help.classList.toggle('theme-dark', dark);
  }

  function ensureThemeObservation() {
    if (!themeObserver) return;
    const body = document.body;
    if (!body || body === themeObservedBody) return;
    themeObservedBody = body;
    themeObserver.observe(body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });
  }

  function startThemeObserver() {
    if (themeObserver) return;
    themeObserver = new MutationObserver(() => applyThemeClass());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });
    ensureThemeObservation();
    setTimeout(() => {
      ensureThemeObservation();
      applyThemeClass();
    }, 0);
  }

  // endregion: Virtualization & Interaction
  // region: UI Render & Bindings
  // ========================== UI：注入样式 ==========================
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{
        position: fixed;
        z-index: 2147483647;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
        user-select: none;
        -webkit-user-select: none;
        --cgpt-glass-blur: 20px;
        --cgpt-glass-sat: 1.28;
        --cgpt-glass-panel: rgba(255,255,255,0.72);
        --cgpt-glass-panel-2: rgba(255,255,255,0.46);
        --cgpt-glass-card: rgba(255,255,255,0.62);
        --cgpt-glass-card-2: rgba(255,255,255,0.38);
        --cgpt-glass-chip: rgba(255,255,255,0.66);
        --cgpt-glass-chip-2: rgba(255,255,255,0.44);
        --cgpt-glass-border: rgba(255,255,255,0.62);
        --cgpt-glass-border-strong: rgba(255,255,255,0.82);
        --cgpt-glass-highlight: rgba(255,255,255,0.82);
        --cgpt-glass-highlight-strong: rgba(255,255,255,0.96);
        --cgpt-glass-shadow: 0 22px 60px rgba(15,23,42,0.16);
        --cgpt-glass-shadow-soft: 0 12px 28px rgba(15,23,42,0.08);
        --cgpt-glass-inset: inset 0 1px 0 rgba(255,255,255,0.86);
        --cgpt-vs-radius-panel: 16px;
        --cgpt-vs-radius-card: 14px;
        --cgpt-vs-radius-pill: 999px;
        --cgpt-vs-control-h-mini: 18px;
        --cgpt-vs-control-h-tag: 22px;
        --cgpt-vs-control-h-seg: 28px;
        --cgpt-vs-control-h-chip: 30px;
        --cgpt-vs-ease-fast: 170ms cubic-bezier(0.22, 0.82, 0.28, 1);
        --cgpt-vs-focus-ring: 0 0 0 2px rgba(16,185,129,0.32), 0 0 0 4px rgba(16,185,129,0.14);
        transform: translateZ(0);
        opacity: 1;
        transition: opacity 160ms ease;
      }
      #${ROOT_ID}.dim{ opacity: 0.2; }
      #${ROOT_ID}.fallback{ filter: saturate(1.02); }

      .${VS_SLIM_CLASS}{
        content-visibility: auto;
        contain-intrinsic-size: 1px var(--cgpt-vs-h, 160px);
      }

      #${BTN_ID}{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: var(--cgpt-vs-control-h-chip);
        padding: 0 10px;
        border-radius: var(--cgpt-vs-radius-pill);
        border: 1px solid var(--cgpt-glass-border);
        background: var(--cgpt-glass-chip);
        backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        -webkit-backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        box-shadow: var(--cgpt-glass-shadow-soft);
        cursor: pointer;
        font-size: 12px;
        color: rgba(0,0,0,0.78);
      }
      #${BTN_ID}:hover{ background: rgba(255,255,255,0.92); }
      #${ROOT_ID} button,
      #${BTN_ID}{
        transition: background var(--cgpt-vs-ease-fast), border-color var(--cgpt-vs-ease-fast), color var(--cgpt-vs-ease-fast), box-shadow var(--cgpt-vs-ease-fast), transform 120ms ease;
      }
      #${ROOT_ID} button:focus-visible,
      #${BTN_ID}:focus-visible{
        outline: none;
        box-shadow: var(--cgpt-vs-focus-ring), var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
      }
      #${ROOT_ID} button:active,
      #${BTN_ID}:active{
        transform: translateY(1px);
      }
      #${STATUS_TEXT_ID}{
        max-width: 220px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0.9;
      }
      #${BTN_ID} .cgpt-vs-miniTags{
        margin-left: auto;
        display:flex;
        align-items:center;
        gap:6px;
      }
      #${BTN_ID} .cgpt-vs-miniItem{
        position: relative;
        min-width: 24px;
        height: var(--cgpt-vs-control-h-mini);
        padding: 0 6px;
        border-radius: var(--cgpt-vs-radius-pill);
        border: 1px solid rgba(255,255,255,0.7);
        background: linear-gradient(140deg, rgba(255,255,255,0.92), rgba(255,255,255,0.62));
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:4px;
        font-size: 10px;
        font-weight: 800;
        color: rgba(0,0,0,0.72);
        backdrop-filter: blur(18px) saturate(1.35);
        -webkit-backdrop-filter: blur(18px) saturate(1.35);
        box-shadow:
          0 8px 18px rgba(0,0,0,0.08),
          inset 0 1px 0 rgba(255,255,255,0.75),
          inset 0 -1px 0 rgba(255,255,255,0.25);
        overflow: hidden;
      }
      #${BTN_ID} .cgpt-vs-miniItem > *{
        position: relative;
        z-index: 1;
      }
      #${BTN_ID} .cgpt-vs-miniItem::before{
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(120% 120% at 10% 0%, rgba(255,255,255,0.75), rgba(255,255,255,0.08) 60%),
          linear-gradient(180deg, rgba(255,255,255,0.45), rgba(255,255,255,0.0));
        opacity: 0.7;
        pointer-events: none;
        z-index: 0;
      }
      #${BTN_ID} .cgpt-vs-miniDot{
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow:
          0 0 0 2px rgba(34,197,94,0.22),
          inset 0 1px 1px rgba(255,255,255,0.6);
      }
      #${BTN_ID} .cgpt-vs-miniText{
        max-width: 90px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${BTN_ID} .cgpt-vs-statusPill .cgpt-vs-miniText{
        max-width: 140px;
      }
      #${BTN_ID} .cgpt-vs-statusPill.ok{
        border-color: rgba(16,185,129,0.6);
        background: linear-gradient(140deg, rgba(16,185,129,0.22), rgba(16,185,129,0.08));
        color: #065f46;
        box-shadow:
          0 10px 22px rgba(16,185,129,0.18),
          inset 0 1px 0 rgba(255,255,255,0.6);
      }
      #${BTN_ID} .cgpt-vs-statusPill.warn{
        border-color: rgba(245,158,11,0.62);
        background: linear-gradient(140deg, rgba(245,158,11,0.22), rgba(245,158,11,0.08));
        color: #92400e;
        box-shadow:
          0 10px 22px rgba(245,158,11,0.18),
          inset 0 1px 0 rgba(255,255,255,0.55);
      }
      #${BTN_ID} .cgpt-vs-statusPill.bad{
        border-color: rgba(239,68,68,0.65);
        background: linear-gradient(140deg, rgba(239,68,68,0.22), rgba(239,68,68,0.08));
        color: #991b1b;
        box-shadow:
          0 10px 22px rgba(239,68,68,0.2),
          inset 0 1px 0 rgba(255,255,255,0.45);
      }
      #${BTN_ID} .cgpt-vs-statusPill.off{
        border-color: rgba(107,114,128,0.55);
        background: linear-gradient(140deg, rgba(107,114,128,0.22), rgba(107,114,128,0.08));
        color: #374151;
        box-shadow:
          0 10px 22px rgba(107,114,128,0.16),
          inset 0 1px 0 rgba(255,255,255,0.4);
      }
      #${BTN_ID} .cgpt-vs-miniItem.pause{
        border-color: rgba(245,158,11,0.6);
        background: linear-gradient(140deg, rgba(245,158,11,0.22), rgba(245,158,11,0.08));
        color: #92400e;
        box-shadow:
          0 10px 22px rgba(245,158,11,0.18),
          inset 0 1px 0 rgba(255,255,255,0.55);
      }
      #${BTN_ID} .cgpt-vs-miniItem.optimizing{
        animation: cgpt-vs-pulse 1.2s ease-in-out infinite;
      }
      @keyframes cgpt-vs-pulse{
        0%{ transform: translateZ(0) scale(1); }
        50%{ transform: translateZ(0) scale(1.04); }
        100%{ transform: translateZ(0) scale(1); }
      }

      #${DOT_ID}{
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 0 2px rgba(34,197,94,0.18);
        transition: transform 140ms ease;
      }
      #${DOT_ID}.warn{
        background: #f59e0b;
        box-shadow: 0 0 0 2px rgba(245,158,11,0.18);
      }
      #${DOT_ID}.bad{
        background: #ef4444;
        box-shadow: 0 0 0 2px rgba(239,68,68,0.18);
      }
      #${DOT_ID}.off{
        background: rgba(0,0,0,0.36);
        box-shadow: 0 0 0 2px rgba(0,0,0,0.12);
      }

      #${PANEL_ID}{
        position: relative;
        overflow: visible;
        margin-top: 14px;
        width: 640px;
        max-width: min(720px, calc(100vw - 16px));
        padding: 12px;
        border-radius: var(--cgpt-vs-radius-panel);
        border: 1px solid var(--cgpt-glass-border-strong);
        background: linear-gradient(135deg, var(--cgpt-glass-panel), var(--cgpt-glass-panel-2));
        backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        -webkit-backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        box-shadow: var(--cgpt-glass-shadow), var(--cgpt-glass-inset);
        display: none;
        color: rgba(0,0,0,0.86);
        font-size: 12px;
        line-height: 1.5;
      }
      #${ROOT_ID}.open #${PANEL_ID}{ display:block; }
      #${PANEL_ID},
      .cgpt-vs-org,
      .cgpt-vs-deg,
      .cgpt-vs-seg,
      .cgpt-vs-helpCard{
        position: relative;
        isolation: isolate;
      }
      #${PANEL_ID}::before,
      .cgpt-vs-org::before,
      .cgpt-vs-deg::before,
      .cgpt-vs-seg::before,
      .cgpt-vs-helpCard::before{
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(140% 100% at 0% 0%, var(--cgpt-glass-highlight-strong, rgba(255,255,255,0.9)), rgba(255,255,255,0) 70%);
        opacity: 0.65;
        pointer-events: none;
        z-index: 0;
      }
      #${PANEL_ID}::after,
      .cgpt-vs-org::after,
      .cgpt-vs-deg::after,
      .cgpt-vs-seg::after,
      .cgpt-vs-helpCard::after{
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.0) 48%, rgba(255,255,255,0.1));
        opacity: 0.55;
        pointer-events: none;
        z-index: 0;
      }
      #${PANEL_ID} > *,
      .cgpt-vs-org > *,
      .cgpt-vs-deg > *,
      .cgpt-vs-seg > *,
      .cgpt-vs-helpCard > *{
        position: relative;
        z-index: 1;
      }
      .cgpt-vs-chip,
      .cgpt-vs-topTag,
      .cgpt-vs-deg-tag,
      .cgpt-vs-deg-badge,
      .cgpt-vs-seg button.active{
        position: relative;
      }
      .cgpt-vs-chip::before,
      .cgpt-vs-topTag::before,
      .cgpt-vs-deg-tag::before,
      .cgpt-vs-deg-badge::before,
      .cgpt-vs-seg button.active::before{
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(140deg, var(--cgpt-glass-highlight, rgba(255,255,255,0.7)), rgba(255,255,255,0) 60%);
        opacity: 0.6;
        pointer-events: none;
        z-index: 0;
      }

      .cgpt-vs-toprow{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom: 8px;
      }

      .cgpt-vs-sectionTitle{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        font-weight: 800;
        font-size: 12px;
        letter-spacing: 0.2px;
        color: rgba(0,0,0,0.72);
      }
      .cgpt-vs-org,
      .cgpt-vs-organism{
        margin-top: 8px;
        padding: 10px;
        border-radius: var(--cgpt-vs-radius-card);
        border: 1px solid var(--cgpt-glass-border-strong);
        background: linear-gradient(145deg, var(--cgpt-glass-card), var(--cgpt-glass-card-2));
        backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        -webkit-backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        box-shadow: var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
      }
      .cgpt-vs-org:first-of-type{ margin-top: 0; }
      /* Atomic Design: Atoms */
      .cgpt-vs-atom{
        backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        -webkit-backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
      }
      .cgpt-vs-actionsGrid{
        display:grid;
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .cgpt-vs-layout,
      .cgpt-vs-template-body{
        margin-top: 8px;
        display:grid;
        grid-template-columns: minmax(280px, 1.1fr) minmax(220px, 0.9fr);
        gap: 10px;
        align-items: stretch;
      }
      .cgpt-vs-col-left,
      .cgpt-vs-col-right{
        display:flex;
        flex-direction: column;
        gap: 8px;
      }
      .cgpt-vs-col-left{ min-height: 100%; }
      .cgpt-vs-org-mood{
        flex: 1;
        min-height: 0;
        display:flex;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
        text-align: left;
      }
      .cgpt-vs-moodText{
        font-size: 12px;
        font-weight: 700;
        color: rgba(0,0,0,0.78);
      }
      .cgpt-vs-moodSub{
        font-size: 11px;
        color: rgba(0,0,0,0.6);
      }
      .cgpt-vs-template-slot{ min-width: 0; }
      @media (max-width: 720px){
        .cgpt-vs-layout{
          grid-template-columns: 1fr;
        }
        .cgpt-vs-chip{
          height: calc(var(--cgpt-vs-control-h-chip) + 4px);
          padding: 0 12px;
        }
        .cgpt-vs-seg button{
          height: calc(var(--cgpt-vs-control-h-seg) + 4px);
        }
        .cgpt-vs-chiprow{
          width: 100%;
          gap: 6px;
        }
        .cgpt-vs-chippair{
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          white-space: normal;
          gap: 6px;
        }
        .cgpt-vs-chippair .cgpt-vs-chip{
          flex: 1 1 calc(50% - 3px);
          min-width: 118px;
        }
        .cgpt-vs-topTags{
          width: 100%;
          justify-content: flex-start;
        }
        .cgpt-vs-topTag{
          max-width: 100%;
        }
      }
      .cgpt-vs-org-status{ padding-bottom: 8px; }
      .cgpt-vs-statusBar{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:8px;
      }
      .cgpt-vs-statusMain{
        display:flex;
        flex-direction:column;
        gap:2px;
        min-width: 0;
      }
      .cgpt-vs-statusText{
        font-weight: 800;
        font-size: 13px;
        color: rgba(0,0,0,0.82);
      }
      .cgpt-vs-statusReason{
        font-size: 11px;
        color: rgba(0,0,0,0.58);
      }
      .cgpt-vs-topTags{
        display:flex;
        align-items:center;
        gap:6px;
        flex-wrap: wrap;
        justify-content:flex-end;
        min-width: 0;
        flex: 1 1 auto;
      }
      .cgpt-vs-topTag{
        height: var(--cgpt-vs-control-h-tag);
        padding: 0 8px;
        border-radius: var(--cgpt-vs-radius-pill);
        border: 1px solid var(--cgpt-glass-border);
        background: linear-gradient(140deg, var(--cgpt-glass-chip), var(--cgpt-glass-chip-2));
        display:inline-flex;
        align-items:center;
        font-weight: 800;
        font-size: 11px;
        color: rgba(0,0,0,0.76);
        backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        -webkit-backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        box-shadow: var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
        min-width: 0;
        max-width: min(190px, 100%);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cgpt-vs-topTag.pause{
        border-color: rgba(245,158,11,0.6);
        background: linear-gradient(140deg, rgba(245,158,11,0.26), rgba(245,158,11,0.12));
        color: #92400e;
      }
      .cgpt-vs-mol-group{ margin-top: 8px; }
      .cgpt-vs-groupTitle{
        font-weight: 800;
        font-size: 11px;
        color: rgba(0,0,0,0.66);
        margin-bottom: 4px;
      }

      .cgpt-vs-seg{
        display:flex;
        align-items:center;
        width: 100%;
        padding: 4px;
        gap: 4px;
        border-radius: var(--cgpt-vs-radius-pill);
        background: linear-gradient(150deg, var(--cgpt-glass-chip), var(--cgpt-glass-chip-2));
        border: 1px solid rgba(255,255,255,0.75);
        box-shadow:
          inset 0 0 0 1px rgba(255,255,255,0.45),
          inset 0 -1px 0 rgba(0,0,0,0.04),
          var(--cgpt-glass-shadow-soft);
        backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        -webkit-backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
      }
      .cgpt-vs-seg button{
        flex:1;
        height: var(--cgpt-vs-control-h-seg);
        border: 1px solid rgba(255,255,255,0.5);
        background: linear-gradient(160deg, rgba(255,255,255,0.58), rgba(255,255,255,0.22));
        border-radius: var(--cgpt-vs-radius-pill);
        cursor: pointer;
        font-size: 12px;
        color: rgba(0,0,0,0.7);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.8),
          inset 0 -1px 0 rgba(0,0,0,0.04);
        transition: background 140ms ease, box-shadow 140ms ease, color 140ms ease;
      }
      .cgpt-vs-seg button:hover{
        background: linear-gradient(160deg, rgba(255,255,255,0.74), rgba(255,255,255,0.28));
      }
      .cgpt-vs-seg button.active{
        border-color: rgba(255,255,255,0.82);
        background: linear-gradient(150deg, var(--cgpt-glass-panel), var(--cgpt-glass-panel-2));
        color: rgba(0,0,0,0.9);
        box-shadow:
          0 12px 26px rgba(15,23,42,0.14),
          inset 0 1px 0 rgba(255,255,255,0.85);
      }

      /* ✅ 5.0 UI：控件区允许换行，避免挤爆 */
      .cgpt-vs-controls{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        margin-top: 10px;
        flex-wrap: wrap;
      }
      .cgpt-vs-mol-group .cgpt-vs-controls{ margin-top: 6px; }
      .cgpt-vs-controls.cgpt-vs-ops{ align-items:center; }
      .cgpt-vs-ops .cgpt-vs-chiprow{ justify-content:flex-start; }
      .cgpt-vs-controls.cgpt-vs-flags{ margin-top: 6px; }
      .cgpt-vs-flags .cgpt-vs-chiprow{ justify-content:flex-start; }
      .cgpt-vs-chiprow{
        display:flex;
        gap:8px;
        flex-wrap: wrap;
        justify-content:flex-end;
      }
      .cgpt-vs-chippair{
        display:inline-flex;
        align-items:center;
        gap:8px;
        flex-wrap: nowrap;
        white-space: nowrap;
      }
      .cgpt-vs-chip{
        height: var(--cgpt-vs-control-h-chip);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 10px;
        border-radius: var(--cgpt-vs-radius-pill);
        border: 1px solid var(--cgpt-glass-border);
        background: linear-gradient(145deg, var(--cgpt-glass-chip), var(--cgpt-glass-chip-2));
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        color: rgba(0,0,0,0.78);
        backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        -webkit-backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        box-shadow: var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
        transition: background var(--cgpt-vs-ease-fast), border-color var(--cgpt-vs-ease-fast), color var(--cgpt-vs-ease-fast), box-shadow var(--cgpt-vs-ease-fast), transform 120ms ease;
      }
      .cgpt-vs-chip:hover{ background: linear-gradient(145deg, rgba(255,255,255,0.94), rgba(255,255,255,0.7)); }
      .cgpt-vs-chip.primary{
        border-color: var(--cgpt-glass-border-strong);
        font-weight: 600;
      }
      .cgpt-vs-chip.danger{
        border-color: rgba(239,68,68,0.45);
        color: #b91c1c;
        background: linear-gradient(145deg, rgba(239,68,68,0.18), rgba(239,68,68,0.08));
        box-shadow: 0 10px 20px rgba(239,68,68,0.18), inset 0 1px 0 rgba(255,255,255,0.45);
        font-weight: 600;
      }
      .cgpt-vs-chip.active{
        border-color: rgba(16,185,129,0.55);
        background: linear-gradient(145deg, rgba(16,185,129,0.26), rgba(16,185,129,0.12));
        color: #065f46;
        box-shadow: 0 12px 24px rgba(16,185,129,0.22), inset 0 1px 0 rgba(255,255,255,0.5);
        font-weight: 700;
      }
      .cgpt-vs-chip.paused{
        border-color: rgba(245,158,11,0.6);
        background: linear-gradient(145deg, rgba(245,158,11,0.28), rgba(245,158,11,0.12));
        color: #92400e;
        box-shadow: 0 12px 24px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.45);
        font-weight: 800;
      }
      #${ROOT_ID} #cgpt-vs-pin{
        min-width: 64px;
      }
      #${ROOT_ID} #cgpt-vs-pin.is-pinned{
        border-color: rgba(16,185,129,0.62);
        background: linear-gradient(145deg, rgba(16,185,129,0.3), rgba(16,185,129,0.14));
        color: #065f46;
        box-shadow: 0 12px 24px rgba(16,185,129,0.22), inset 0 1px 0 rgba(255,255,255,0.5);
        font-weight: 700;
      }
      .cgpt-vs-chip-ghost{
        background: transparent;
        border-style: dashed;
        box-shadow: none;
        color: rgba(0,0,0,0.64);
      }
      .cgpt-vs-chip-ghost:hover{ background: rgba(0,0,0,0.05); }
      @media (prefers-reduced-motion: reduce){
        #${ROOT_ID} *,
        #${HELP_ID} *{
          animation-duration: 1ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 1ms !important;
        }
      }

      .cgpt-vs-deg{
        padding: 10px;
        border-radius: var(--cgpt-vs-radius-card);
        border: 1px solid var(--cgpt-glass-border-strong);
        background: linear-gradient(145deg, var(--cgpt-glass-card), var(--cgpt-glass-card-2));
        backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        -webkit-backdrop-filter: blur(var(--cgpt-glass-blur)) saturate(var(--cgpt-glass-sat));
        box-shadow: var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
      }
      .cgpt-vs-deg.warn{
        border-color: rgba(245,158,11,0.55);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.72),
          0 10px 26px rgba(245,158,11,0.18);
      }
      .cgpt-vs-deg.bad{
        border-color: rgba(239,68,68,0.65);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.72),
          0 12px 28px rgba(239,68,68,0.22);
      }
      .cgpt-vs-deg-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        margin-bottom: 4px;
      }
      .cgpt-vs-deg-title{
        font-weight: 800;
        font-size: 12px;
        letter-spacing: 0.2px;
        color: rgba(0,0,0,0.74);
      }
      .cgpt-vs-deg-grid{
        display:flex;
        flex-direction:column;
        gap: 0;
      }
      .cgpt-vs-deg-value{
        display:flex;
        align-items:center;
        gap:4px;
        flex-wrap: wrap;
        justify-content:flex-end;
        min-width: 0;
      }
      .cgpt-vs-deg-text{
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: rgba(0,0,0,0.82);
      }
      .cgpt-vs-deg-tag,
      .cgpt-vs-deg-badge{
        position: relative;
        display:inline-flex;
        align-items:center;
        height: var(--cgpt-vs-control-h-tag);
        padding: 0 8px;
        border-radius: var(--cgpt-vs-radius-pill);
        border: 1px solid rgba(255,255,255,0.7);
        background: linear-gradient(140deg, rgba(255,255,255,0.92), rgba(255,255,255,0.62));
        color: rgba(0,0,0,0.72);
        font-weight: 800;
        font-size: 11px;
        letter-spacing: 0.2px;
        white-space: nowrap;
        backdrop-filter: blur(16px) saturate(1.3);
        -webkit-backdrop-filter: blur(16px) saturate(1.3);
        box-shadow:
          0 8px 18px rgba(0,0,0,0.08),
          inset 0 1px 0 rgba(255,255,255,0.75);
        overflow: hidden;
      }
      .cgpt-vs-deg-tag::before,
      .cgpt-vs-deg-badge::before{
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background:
          radial-gradient(120% 120% at 10% 0%, rgba(255,255,255,0.75), rgba(255,255,255,0.08) 60%),
          linear-gradient(180deg, rgba(255,255,255,0.45), rgba(255,255,255,0.0));
        opacity: 0.7;
        pointer-events: none;
      }
      .cgpt-vs-deg-tag::after,
      .cgpt-vs-deg-badge::after{
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--cgpt-vs-tag-tint, transparent);
        opacity: 0.25;
        pointer-events: none;
      }
      .cgpt-vs-deg-badge{
        text-transform: lowercase;
        --cgpt-vs-tag-tint: rgba(16,185,129,0.18);
        color: #047857;
      }
      .cgpt-vs-deg-bar{
        margin-top: 6px;
        height: 6px;
        border-radius: 999px;
        border: 1px solid var(--cgpt-glass-border);
        background: linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.12));
        overflow:hidden;
        position: relative;
        box-sizing: border-box;
        box-shadow: var(--cgpt-glass-inset);
      }
      .cgpt-vs-deg-barInner{
        position:absolute;
        inset:0 auto 0 0;
        width: 8%;
        border-radius: 999px;
        background: linear-gradient(90deg, #22c55e, #10b981);
        transition: width 220ms ease, background 220ms ease;
      }

      /* Scoped tooltips */
      #${ROOT_ID} [data-tooltip]{
        position: relative;
        overflow: visible;
      }
      #${ROOT_ID} [data-tooltip]::after{
        content: attr(data-tooltip);
        position: absolute;
        left: 50%;
        bottom: calc(100% + 6px);
        transform: translateX(-50%) translateY(4px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease, transform 140ms ease;
        white-space: pre-line;
        min-width: 0;
        max-width: min(320px, calc(100vw - 32px));
        width: max-content;
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(17,24,39,0.94);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 18px 36px rgba(0,0,0,0.28);
        z-index: 2147483647;
        font-size: 11px;
        line-height: 1.55;
        overflow-wrap: anywhere;
      }
      #${ROOT_ID} [data-tooltip]:hover::after{
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      #${ROOT_ID} .cgpt-vs-org-monitor [data-tooltip]::after{
        left: auto;
        right: 0;
        transform: translateX(0) translateY(4px);
        max-width: min(260px, calc(100vw - 32px));
      }
      #${ROOT_ID} .cgpt-vs-org-monitor [data-tooltip]:hover::after{
        transform: translateX(0) translateY(0);
      }
      #${ROOT_ID} .cgpt-vs-org-monitor .cgpt-vs-deg-tag[data-tooltip]::after,
      #${ROOT_ID} .cgpt-vs-org-monitor .cgpt-vs-deg-badge[data-tooltip]::after{
        content: none;
        display: none;
      }
      #${BTN_ID} .cgpt-vs-miniItem[data-tooltip]::after{
        top: calc(100% + 6px);
        bottom: auto;
        transform: translateX(-50%) translateY(-4px);
      }
      #${BTN_ID} .cgpt-vs-miniItem[data-tooltip]:hover::after{
        transform: translateX(-50%) translateY(0);
      }

      .cgpt-vs-row{
        display:flex;
        justify-content:space-between;
        gap: 12px;
        padding: 4px 0;
      }
      .cgpt-vs-k{ color: rgba(0,0,0,0.56); }
      .cgpt-vs-v{ font-variant-numeric: tabular-nums; }
      .cgpt-vs-valueGroup{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        flex-wrap: nowrap;
        width: 100%;
      }
      .cgpt-vs-valueGroup.tight{
        justify-content: flex-end;
        gap: 6px;
      }
      .cgpt-vs-valueGroup.stack{
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
      }
      .cgpt-vs-valueGroup.stack.reverse{
        flex-direction: column-reverse;
      }
      .cgpt-vs-valueGroup.stack .cgpt-vs-tag{
        align-self: flex-start;
      }
      .cgpt-vs-valueGroup.stack .cgpt-vs-valueText{
        align-self: flex-end;
      }
      .cgpt-vs-valueText{
        font-weight: 700;
        color: rgba(0,0,0,0.82);
        white-space: nowrap;
      }
      .cgpt-vs-tag{
        position: relative;
        display:inline-flex;
        align-items:center;
        height: var(--cgpt-vs-control-h-mini);
        padding: 0 8px;
        border-radius: var(--cgpt-vs-radius-pill);
        border: 1px solid rgba(255,255,255,0.7);
        background: linear-gradient(140deg, rgba(255,255,255,0.92), rgba(255,255,255,0.62));
        color: rgba(0,0,0,0.72);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.2px;
        white-space: nowrap;
        backdrop-filter: blur(16px) saturate(1.3);
        -webkit-backdrop-filter: blur(16px) saturate(1.3);
        box-shadow:
          0 8px 18px rgba(0,0,0,0.08),
          inset 0 1px 0 rgba(255,255,255,0.75);
        overflow: hidden;
      }
      .cgpt-vs-tag::before{
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(120% 120% at 10% 0%, rgba(255,255,255,0.75), rgba(255,255,255,0.08) 60%),
          linear-gradient(180deg, rgba(255,255,255,0.45), rgba(255,255,255,0.0));
        opacity: 0.7;
        pointer-events: none;
      }
      .cgpt-vs-tag > *{ position: relative; z-index: 1; }
      .cgpt-vs-tag.warn{
        border-color: rgba(245,158,11,0.6);
        background: linear-gradient(140deg, rgba(245,158,11,0.22), rgba(245,158,11,0.08));
        color: #92400e;
      }
      .cgpt-vs-tag.ok{
        border-color: rgba(16,185,129,0.6);
        background: linear-gradient(140deg, rgba(16,185,129,0.22), rgba(16,185,129,0.08));
        color: #065f46;
      }
      .cgpt-vs-tag.bad{
        border-color: rgba(239,68,68,0.6);
        background: linear-gradient(140deg, rgba(239,68,68,0.22), rgba(239,68,68,0.08));
        color: #991b1b;
      }
      .cgpt-vs-org-stats .cgpt-vs-row{
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(140px, 0.9fr);
        column-gap: 12px;
        align-items: baseline;
      }
      .cgpt-vs-org-stats .cgpt-vs-row.cgpt-vs-row-plan{
        grid-template-columns: 1fr;
        row-gap: 4px;
        align-items: start;
      }
      .cgpt-vs-org-stats .cgpt-vs-k{
        min-width: 0;
      }
      .cgpt-vs-org-stats .cgpt-vs-v{
        min-width: 0;
        text-align: right;
        justify-self: stretch;
        word-break: break-word;
      }

      .mem-ok{ color:#16a34a; font-weight: 600; }
      .mem-warn{ color:#d97706; font-weight: 600; }
      .mem-bad{ color:#dc2626; font-weight: 700; }
      .cgpt-vs-tag.mem-ok{ color:#16a34a; }
      .cgpt-vs-tag.mem-warn{ color:#d97706; }
      .cgpt-vs-tag.mem-bad{ color:#dc2626; }

      .cgpt-vs-hr{
        height: 1px;
        background: rgba(0,0,0,0.08);
        margin: 10px 0 8px;
      }
      .cgpt-vs-tip{ color: rgba(0,0,0,0.74); }

      .cgpt-vs-link{ color: rgba(37,99,235,0.95); text-decoration:none; font-weight: 600; font-size: 12px; }
      .cgpt-vs-link:hover{ text-decoration: underline; }

      #${HELP_ID}{
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.30);
        display:none;
        align-items:center;
        justify-content:center;
        z-index: 2147483647;
      }
      #${HELP_ID}.show{ display:flex; }
      .cgpt-vs-helpCard{
        width: min(720px, calc(100vw - 20px));
        max-height: min(78vh, 680px);
        overflow:auto;
        padding: 16px 16px;
        border-radius: 18px;
        border: 1px solid var(--cgpt-glass-border-strong, rgba(255,255,255,0.75));
        background: linear-gradient(135deg, var(--cgpt-glass-panel, rgba(255,255,255,0.88)), var(--cgpt-glass-panel-2, rgba(255,255,255,0.55)));
        backdrop-filter: blur(18px) saturate(1.2);
        -webkit-backdrop-filter: blur(18px) saturate(1.2);
        box-shadow: 0 22px 60px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.75);
        color: rgba(0,0,0,0.86);
        line-height: 1.55;
      }
      .cgpt-vs-helpTitle{ font-size: 14px; font-weight: 800; margin-bottom: 8px; }
      .cgpt-vs-helpClose{
        position: sticky;
        top: 0;
        float: right;
        height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,0.14);
        background: rgba(255,255,255,0.94);
        cursor:pointer;
      }

      /* ✅ 主题适配：暗色模式玻璃态 */
      #${ROOT_ID}.theme-dark{
        color: rgba(255,255,255,0.92);
        --cgpt-glass-panel: rgba(15,23,42,0.84);
        --cgpt-glass-panel-2: rgba(8,12,26,0.68);
        --cgpt-glass-card: rgba(30,41,59,0.8);
        --cgpt-glass-card-2: rgba(15,23,42,0.62);
        --cgpt-glass-chip: rgba(30,41,59,0.72);
        --cgpt-glass-chip-2: rgba(15,23,42,0.56);
        --cgpt-glass-border: rgba(255,255,255,0.18);
        --cgpt-glass-border-strong: rgba(255,255,255,0.28);
        --cgpt-glass-highlight: rgba(255,255,255,0.24);
        --cgpt-glass-highlight-strong: rgba(255,255,255,0.4);
        --cgpt-glass-shadow: 0 22px 60px rgba(0,0,0,0.62);
        --cgpt-glass-shadow-soft: 0 14px 30px rgba(0,0,0,0.42);
        --cgpt-glass-inset: inset 0 1px 0 rgba(255,255,255,0.12);
        --cgpt-vs-focus-ring: 0 0 0 2px rgba(52,211,153,0.42), 0 0 0 4px rgba(16,185,129,0.22);
      }
      #${ROOT_ID}.theme-dark #${BTN_ID}{
        border-color: var(--cgpt-glass-border);
        background: var(--cgpt-glass-chip);
        color: rgba(255,255,255,0.9);
        box-shadow: var(--cgpt-glass-shadow);
      }
      #${ROOT_ID}.theme-dark #${BTN_ID} .cgpt-vs-miniItem{
        border-color: rgba(255,255,255,0.22);
        background: linear-gradient(150deg, rgba(30,41,59,0.92), rgba(15,23,42,0.78));
        color: rgba(255,255,255,0.92);
        backdrop-filter: blur(18px) saturate(1.2);
        -webkit-backdrop-filter: blur(18px) saturate(1.2);
        box-shadow:
          0 10px 22px rgba(0,0,0,0.45),
          inset 0 1px 0 rgba(255,255,255,0.08),
          inset 0 -1px 0 rgba(0,0,0,0.4);
      }
      #${ROOT_ID}.theme-dark #${BTN_ID} .cgpt-vs-miniItem::before{
        background:
          radial-gradient(120% 120% at 10% 0%, rgba(255,255,255,0.2), rgba(255,255,255,0.04) 60%),
          linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.0));
        opacity: 0.55;
      }
      #${ROOT_ID}.theme-dark #${BTN_ID} .cgpt-vs-statusPill.ok{
        border-color: rgba(52,211,153,0.62);
        background: linear-gradient(140deg, rgba(16,185,129,0.35), rgba(16,185,129,0.16));
        color: #d1fae5;
        box-shadow:
          0 12px 24px rgba(16,185,129,0.22),
          inset 0 1px 0 rgba(255,255,255,0.08);
      }
      #${ROOT_ID}.theme-dark #${BTN_ID} .cgpt-vs-statusPill.warn{
        border-color: rgba(251,191,36,0.72);
        background: linear-gradient(140deg, rgba(251,191,36,0.32), rgba(251,191,36,0.14));
        color: #fde68a;
        box-shadow:
          0 12px 24px rgba(251,191,36,0.22),
          inset 0 1px 0 rgba(255,255,255,0.08);
      }
      #${ROOT_ID}.theme-dark #${BTN_ID} .cgpt-vs-statusPill.bad{
        border-color: rgba(248,113,113,0.72);
        background: linear-gradient(140deg, rgba(248,113,113,0.28), rgba(248,113,113,0.12));
        color: #fecaca;
        box-shadow:
          0 12px 24px rgba(248,113,113,0.22),
          inset 0 1px 0 rgba(255,255,255,0.08);
      }
      #${ROOT_ID}.theme-dark #${BTN_ID} .cgpt-vs-statusPill.off{
        border-color: rgba(148,163,184,0.55);
        background: linear-gradient(140deg, rgba(148,163,184,0.24), rgba(148,163,184,0.12));
        color: #e2e8f0;
        box-shadow:
          0 12px 24px rgba(148,163,184,0.18),
          inset 0 1px 0 rgba(255,255,255,0.06);
      }
      #${ROOT_ID}.theme-dark #${BTN_ID} .cgpt-vs-miniItem.pause{
        border-color: rgba(251,191,36,0.72);
        background: linear-gradient(140deg, rgba(251,191,36,0.32), rgba(251,191,36,0.14));
        color: #fde68a;
        box-shadow:
          0 12px 24px rgba(251,191,36,0.22),
          inset 0 1px 0 rgba(255,255,255,0.08);
      }
      #${ROOT_ID}.theme-dark #${BTN_ID}:hover{ background: rgba(30,41,59,0.92); }
      #${ROOT_ID}.theme-dark #${PANEL_ID}{
        border-color: var(--cgpt-glass-border-strong);
        background: linear-gradient(135deg, var(--cgpt-glass-panel), var(--cgpt-glass-panel-2));
        color: rgba(255,255,255,0.92);
        box-shadow: var(--cgpt-glass-shadow), var(--cgpt-glass-inset);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-org{
        border-color: var(--cgpt-glass-border-strong);
        background: linear-gradient(150deg, var(--cgpt-glass-card), var(--cgpt-glass-card-2));
        box-shadow: var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-sectionTitle,
      #${ROOT_ID}.theme-dark .cgpt-vs-groupTitle{ color: rgba(255,255,255,0.76); }
      #${ROOT_ID}.theme-dark .cgpt-vs-statusText{ color: rgba(255,255,255,0.94); }
      #${ROOT_ID}.theme-dark .cgpt-vs-statusReason{ color: rgba(255,255,255,0.7); }
      #${ROOT_ID}.theme-dark .cgpt-vs-topTag{
        border-color: var(--cgpt-glass-border);
        background: linear-gradient(145deg, var(--cgpt-glass-chip), var(--cgpt-glass-chip-2));
        color: rgba(255,255,255,0.92);
        box-shadow: var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-topTag.pause{
        border-color: rgba(251,191,36,0.72);
        background: linear-gradient(145deg, rgba(251,191,36,0.32), rgba(251,191,36,0.16));
        color: #fde68a;
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-valueText{ color: rgba(255,255,255,0.92); }
      #${ROOT_ID}.theme-dark .cgpt-vs-tag{
        border-color: rgba(255,255,255,0.22);
        background: linear-gradient(150deg, rgba(30,41,59,0.92), rgba(15,23,42,0.78));
        color: rgba(255,255,255,0.9);
        box-shadow:
          0 10px 22px rgba(0,0,0,0.45),
          inset 0 1px 0 rgba(255,255,255,0.08);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-tag::before{
        background:
          radial-gradient(120% 120% at 10% 0%, rgba(255,255,255,0.2), rgba(255,255,255,0.04) 60%),
          linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.0));
        opacity: 0.55;
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-tag.warn{
        border-color: rgba(251,191,36,0.7);
        background: linear-gradient(140deg, rgba(251,191,36,0.32), rgba(251,191,36,0.14));
        color: #fde68a;
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-tag.ok{
        border-color: rgba(52,211,153,0.62);
        background: linear-gradient(140deg, rgba(16,185,129,0.35), rgba(16,185,129,0.16));
        color: #d1fae5;
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-tag.bad{
        border-color: rgba(248,113,113,0.72);
        background: linear-gradient(140deg, rgba(248,113,113,0.28), rgba(248,113,113,0.12));
        color: #fecaca;
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-k{ color: rgba(255,255,255,0.64); }
      #${ROOT_ID}.theme-dark .cgpt-vs-tip{ color: rgba(255,255,255,0.82); }
      #${ROOT_ID}.theme-dark .cgpt-vs-hr{ background: rgba(255,255,255,0.12); }
      #${ROOT_ID}.theme-dark .cgpt-vs-seg{
        background: linear-gradient(150deg, rgba(30,41,59,0.9), rgba(15,23,42,0.72));
        border-color: rgba(255,255,255,0.22);
        box-shadow:
          inset 0 0 0 1px rgba(255,255,255,0.06),
          0 12px 26px rgba(0,0,0,0.45);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-seg button{
        border: 1px solid rgba(255,255,255,0.14);
        background: linear-gradient(160deg, rgba(30,41,59,0.72), rgba(15,23,42,0.52));
        color: rgba(255,255,255,0.78);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-seg button:hover{
        background: linear-gradient(160deg, rgba(51,65,85,0.8), rgba(15,23,42,0.6));
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-seg button.active{
        border-color: rgba(255,255,255,0.28);
        background: linear-gradient(160deg, rgba(255,255,255,0.24), rgba(255,255,255,0.08));
        color: rgba(255,255,255,0.96);
        box-shadow:
          0 12px 26px rgba(0,0,0,0.55),
          inset 0 1px 0 rgba(255,255,255,0.18);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-chip{
        border-color: var(--cgpt-glass-border);
        background: linear-gradient(145deg, var(--cgpt-glass-chip), var(--cgpt-glass-chip-2));
        color: rgba(255,255,255,0.9);
        box-shadow: var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-chip:hover{ background: linear-gradient(145deg, rgba(51,65,85,0.9), rgba(15,23,42,0.7)); }
      #${ROOT_ID}.theme-dark .cgpt-vs-chip.primary{ border-color: var(--cgpt-glass-border-strong); }
      #${ROOT_ID}.theme-dark .cgpt-vs-chip.danger{
        border-color: rgba(248,113,113,0.6);
        background: linear-gradient(145deg, rgba(248,113,113,0.3), rgba(248,113,113,0.14));
        color: #fecaca;
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-chip.active{
        border-color: rgba(52,211,153,0.6);
        background: linear-gradient(145deg, rgba(16,185,129,0.3), rgba(16,185,129,0.16));
        color: #d1fae5;
        box-shadow: 0 14px 28px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.12);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-chip.paused{
        border-color: rgba(251,191,36,0.72);
        background: linear-gradient(145deg, rgba(251,191,36,0.34), rgba(251,191,36,0.18));
        color: #fde68a;
        box-shadow: 0 14px 28px rgba(251,191,36,0.28), inset 0 1px 0 rgba(255,255,255,0.12);
      }
      #${ROOT_ID}.theme-dark #cgpt-vs-pin.is-pinned{
        border-color: rgba(52,211,153,0.62);
        background: linear-gradient(145deg, rgba(16,185,129,0.34), rgba(16,185,129,0.18));
        color: #d1fae5;
        box-shadow: 0 14px 28px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.12);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-chip-ghost{
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.2);
        color: rgba(255,255,255,0.82);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-chip-ghost:hover{ background: rgba(255,255,255,0.08); }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg{
        border-color: var(--cgpt-glass-border-strong);
        background: linear-gradient(145deg, var(--cgpt-glass-card), var(--cgpt-glass-card-2));
        box-shadow: var(--cgpt-glass-shadow-soft), var(--cgpt-glass-inset);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg.warn{
        border-color: rgba(251,191,36,0.62);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.06),
          0 16px 30px rgba(251,191,36,0.22);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg.bad{
        border-color: rgba(248,113,113,0.72);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.06),
          0 18px 34px rgba(248,113,113,0.26);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg-title{ color: rgba(255,255,255,0.9); }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg-text{ color: rgba(255,255,255,0.9); }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg-tag,
      #${ROOT_ID}.theme-dark .cgpt-vs-deg-badge{
        border-color: rgba(255,255,255,0.22);
        background: linear-gradient(150deg, rgba(30,41,59,0.92), rgba(15,23,42,0.78));
        color: rgba(255,255,255,0.92);
        box-shadow:
          0 10px 22px rgba(0,0,0,0.45),
          inset 0 1px 0 rgba(255,255,255,0.08);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg-badge{
        color: #d1fae5;
        --cgpt-vs-tag-tint: rgba(52,211,153,0.2);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg-bar{
        border-color: rgba(255,255,255,0.14);
        background: linear-gradient(135deg, rgba(255,255,255,0.24), rgba(255,255,255,0.08));
        box-shadow: var(--cgpt-glass-inset);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-deg-barInner{
        background: linear-gradient(90deg, #34d399, #22d3ee);
      }
      #${ROOT_ID}.theme-dark .cgpt-vs-link{ color: rgba(147,197,253,0.98); }
      #${ROOT_ID}.theme-dark .mem-ok{ color:#4ade80; }
      #${ROOT_ID}.theme-dark .mem-warn{ color:#fbbf24; }
      #${ROOT_ID}.theme-dark .mem-bad{ color:#f87171; }
      #${ROOT_ID}.theme-dark .cgpt-vs-tag.mem-ok{ color:#4ade80; }
      #${ROOT_ID}.theme-dark .cgpt-vs-tag.mem-warn{ color:#fbbf24; }
      #${ROOT_ID}.theme-dark .cgpt-vs-tag.mem-bad{ color:#f87171; }

      #${HELP_ID}.theme-dark{ background: rgba(0,0,0,0.56); }
      #${HELP_ID}.theme-dark .cgpt-vs-helpCard{
        border-color: rgba(255,255,255,0.18);
        background: linear-gradient(135deg, rgba(15,23,42,0.92), rgba(8,12,24,0.78));
        color: rgba(255,255,255,0.92);
        box-shadow: 0 24px 70px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.08);
      }
      #${HELP_ID}.theme-dark .cgpt-vs-helpClose{
        border-color: rgba(255,255,255,0.18);
        background: rgba(30,41,59,0.9);
        color: rgba(255,255,255,0.94);
      }

      #${ROOT_ID}.booting #${DOT_ID},
      #${ROOT_ID}.booting .cgpt-vs-miniDot{
        background: #9ca3af;
        box-shadow: 0 0 0 2px rgba(156,163,175,0.18);
      }
      #${ROOT_ID}.booting #${STATUS_PILL_ID}{
        border-color: rgba(107,114,128,0.45);
        background: rgba(107,114,128,0.18);
        color: rgba(55,65,81,0.85);
        box-shadow: 0 10px 22px rgba(107,114,128,0.12);
      }
      #${ROOT_ID}.booting .cgpt-vs-statusText{
        color: rgba(55,65,81,0.7);
      }
      #${ROOT_ID}.booting .cgpt-vs-deg-tag,
      #${ROOT_ID}.booting .cgpt-vs-topTag{
        color: rgba(107,114,128,0.85);
        border-color: rgba(0,0,0,0.1);
        background: rgba(255,255,255,0.82);
        box-shadow: 0 4px 10px rgba(0,0,0,0.05);
      }
      #${ROOT_ID}.booting .cgpt-vs-deg-text{
        color: rgba(107,114,128,0.8);
      }
      #${ROOT_ID}.theme-dark.booting #${STATUS_PILL_ID}{
        border-color: rgba(148,163,184,0.45);
        background: rgba(148,163,184,0.18);
        color: rgba(226,232,240,0.92);
        box-shadow: 0 10px 22px rgba(0,0,0,0.38);
      }
      #${ROOT_ID}.theme-dark.booting .cgpt-vs-deg-tag,
      #${ROOT_ID}.theme-dark.booting .cgpt-vs-topTag{
        color: rgba(226,232,240,0.9);
        border-color: rgba(255,255,255,0.18);
        background: rgba(51,65,85,0.76);
        box-shadow: 0 8px 18px rgba(0,0,0,0.38);
      }
      #${ROOT_ID}.theme-dark.booting .cgpt-vs-deg-text{
        color: rgba(226,232,240,0.75);
      }

      #${ROOT_ID}.pinned #${BTN_ID}{ cursor: grab; }
      #${ROOT_ID}.pinned.dragging #${BTN_ID}{
        cursor: grabbing;
        box-shadow: 0 18px 44px rgba(0,0,0,0.24);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function getHelpLayerMarkup() {
    return `
      <div class="cgpt-vs-helpCard" role="dialog" aria-label="Help">
        <button class="cgpt-vs-helpClose" id="cgpt-vs-helpClose">${lang === 'zh' ? '关闭' : 'Close'}</button>
        <div class="cgpt-vs-helpTitle">${lang === 'zh' ? '长对话加速仪表盘（小白版说明）' : 'Long Chat Accelerator (Quick Guide)'}</div>

        <div style="margin:8px 0 10px;">
          <b>${lang === 'zh' ? '绿/黄/红小圆点是什么？' : 'What is the green/yellow/red dot?'}</b><br/>
          ${lang === 'zh'
            ? '它是网页健康度指示灯：绿色=状态好；黄色=负载偏高；红色=接近卡顿区。'
            : 'It indicates page health: green=good, yellow=high load, red=near lag.'}
        </div>

        <div style="margin:10px 0;">
          <b>${lang === 'zh' ? '三段模式怎么选？' : 'How to choose modes?'}</b><br/>
          ${lang === 'zh'
            ? '性能=最省资源；平衡=日常推荐；保守=保留更多历史但更吃资源。'
            : 'Performance=lowest resource; Balanced=recommended; Conservative=keeps more history but uses more resources.'}
        </div>

        <div style="margin:10px 0;">
          <b>${lang === 'zh' ? '暂停/启用有什么区别？' : 'Pause vs Enable?'}</b><br/>
          ${lang === 'zh'
            ? '启用会把屏幕外历史折叠成占位以减负；暂停会完整显示但更容易卡。'
            : 'Enable folds off-screen history to reduce load; Pause shows full history but may lag.'}
        </div>

        <div style="margin:10px 0;">
          <b>${lang === 'zh' ? '“优化”会丢内容吗？' : 'Does “Optimize” delete content?'}</b><br/>
          ${lang === 'zh'
            ? '不会。点击“优化”会根据负载自动选择软/硬与屏数；远距历史可能被占位，靠近会自动恢复。'
            : 'No. Optimize auto picks soft/hard and screen ranges by load; far history may become placeholders and restores as you scroll near.'}
        </div>

        <div style="margin:10px 0;">
          <b>${lang === 'zh' ? 'Ctrl+F 搜索为什么会变慢？' : 'Why Find (Ctrl+F) can be slower?'}</b><br/>
          ${lang === 'zh'
            ? '为了让你能搜到所有历史，脚本会临时恢复完整内容；按 Esc 退出后自动恢复。'
            : 'To let you search all history, the script temporarily restores full content; press Esc to resume acceleration.'}
        </div>

        <div style="margin:10px 0;">
          <b>${lang === 'zh' ? '隐私与声明' : 'Privacy'}</b><br/>
          ${lang === 'zh'
            ? '本脚本不上传任何对话内容，所有逻辑均在浏览器本地运行。'
            : 'This script does not upload your chat. Everything runs locally in your browser.'}
        </div>
      </div>
    `;
  }

  function ensureHelpLayer() {
    let help = document.getElementById(HELP_ID);
    if (help) return help;
    help = document.createElement('div');
    help.id = HELP_ID;
    help.innerHTML = getHelpLayerMarkup();
    document.body.appendChild(help);
    return help;
  }

  function collectDataNodes(root) {
    const nodes = Object.create(null);
    root.querySelectorAll('[data-k]').forEach((el) => {
      const key = el.getAttribute('data-k');
      if (!key || nodes[key]) return;
      nodes[key] = el;
    });
    return nodes;
  }

  function collectUiRefs(root) {
    return {
      root,
      btn: root.querySelector('#' + BTN_ID),
      panel: root.querySelector('#' + PANEL_ID),
      dot: root.querySelector('#' + DOT_ID),
      statusText: root.querySelector('#' + STATUS_TEXT_ID),
      statusPill: root.querySelector('#' + STATUS_PILL_ID),
      statusMain: root.querySelector('[data-k="statusMain"]'),
      statusReason: root.querySelector('#' + STATUS_REASON_ID),
      toggleBtn: root.querySelector('#cgpt-vs-toggle'),
      pinBtn: root.querySelector('#cgpt-vs-pin'),
      helpBtn: root.querySelector('#cgpt-vs-helpBtn'),
      optimizeBtn: root.querySelector('#' + OPTIMIZE_BTN_ID),
      newChatBtn: root.querySelector('#cgpt-vs-newChat'),
      autoPauseBtn: root.querySelector('#' + AUTO_PAUSE_BTN_ID),
      scrollLatestBtn: root.querySelector('#' + SCROLL_LATEST_BTN_ID),
      chatExportBtn: root.querySelector('#' + CHAT_EXPORT_BTN_ID),
      logExportBtn: root.querySelector('#' + LOG_EXPORT_BTN_ID),
      pauseTag: root.querySelector('#' + TOP_PAUSE_TAG_ID),
      optTag: root.querySelector('#' + TOP_OPT_TAG_ID),
      topSvcTag: root.querySelector('#' + TOP_SVC_TAG_ID),
      topIpTag: root.querySelector('#' + TOP_IP_TAG_ID),
      topPowTag: root.querySelector('#' + TOP_POW_TAG_ID),
      degSection: root.querySelector('#' + DEG_SECTION_ID),
      degRefreshBtn: root.querySelector('#' + DEG_REFRESH_BTN_ID),
      degServiceDesc: root.querySelector('#' + DEG_SERVICE_DESC_ID),
      degServiceTag: root.querySelector('#' + DEG_SERVICE_TAG_ID),
      degIpValue: root.querySelector('#' + DEG_IP_VALUE_ID),
      degIpTag: root.querySelector('#' + DEG_IP_TAG_ID),
      degIpBadge: root.querySelector('#' + DEG_IP_BADGE_ID),
      degPowValue: root.querySelector('#' + DEG_POW_VALUE_ID),
      degPowTag: root.querySelector('#' + DEG_POW_TAG_ID),
      degPowBar: root.querySelector('#' + DEG_POW_BAR_ID),
      modeValue: root.querySelector('[data-k="mode"]'),
      planValue: root.querySelector('[data-k="plan"]'),
      memValue: root.querySelector('[data-k="mem"]'),
      dataNodes: collectDataNodes(root)
    };
  }

  function refreshUiRefs(root) {
    if (!root) return null;
    uiRefs = collectUiRefs(root);
    return uiRefs;
  }

  function getUiRefs(root) {
    const targetRoot = root || document.getElementById(ROOT_ID);
    if (!targetRoot) return null;
    if (!uiRefs || uiRefs.root !== targetRoot || !document.body.contains(targetRoot)) {
      return refreshUiRefs(targetRoot);
    }
    if (!uiRefs.panel || !targetRoot.contains(uiRefs.panel)) {
      return refreshUiRefs(targetRoot);
    }
    return uiRefs;
  }

  function getPinButtonMeta(isPinned) {
    if (lang === 'zh') {
      if (isPinned) {
        return {
          label: '自由',
          title: '自由（可拖动）；点击切换为贴合（自动跟随）',
          aria: '当前为自由模式，点击切换为贴合模式'
        };
      }
      return {
        label: '贴合',
        title: '贴合（自动跟随）；点击切换为自由并启用拖动',
        aria: '当前为贴合模式，点击切换为自由模式'
      };
    }
    if (isPinned) {
      return {
        label: 'Free',
        title: 'Free (draggable). Click to switch to Follow (auto).',
        aria: 'Currently in Free mode. Click to switch to Follow mode.'
      };
    }
    return {
      label: 'Follow',
      title: 'Follow (auto). Click to switch to Free and drag manually.',
      aria: 'Currently in Follow mode. Click to switch to Free mode.'
    };
  }

  // ========================== UI：构建 Root ==========================
  function ensureRoot() {
    injectStyles();

    let root = document.getElementById(ROOT_ID);
    if (root) {
      const helpLayer = ensureHelpLayer();
      getUiRefs(root);
      bindHelpUI(root, helpLayer);
      syncUiLayerPriority(true);
      return root;
    }

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.classList.add('booting');
    logEvent('info', 'ui.createRoot');
    const pinMeta = getPinButtonMeta(pinned);

    root.innerHTML = `
      <div id="${BTN_ID}" class="cgpt-vs-atom cgpt-vs-btn" role="button" tabindex="0" aria-label="ChatGPT Virtual Scroll Engine">
        <span id="${STATUS_PILL_ID}" class="cgpt-vs-miniItem cgpt-vs-atom cgpt-vs-statusPill">
          <span id="${DOT_ID}" class="cgpt-vs-miniDot"></span>
          <span id="${STATUS_TEXT_ID}" class="cgpt-vs-miniText">${t('health')}</span>
        </span>
        <span id="${TOP_TAGS_ID}" class="cgpt-vs-miniTags cgpt-vs-molecule">
          <span class="cgpt-vs-miniItem cgpt-vs-atom" id="${TOP_SVC_TAG_ID}" data-tooltip="${t('monitorServiceTip')}">
            <span class="cgpt-vs-miniDot"></span>
            <span class="cgpt-vs-miniText">Service</span>
          </span>
          <span class="cgpt-vs-miniItem cgpt-vs-atom" id="${TOP_IP_TAG_ID}" data-tooltip="${t('monitorIpTip')}">
            <span class="cgpt-vs-miniDot"></span>
            <span class="cgpt-vs-miniText">IP</span>
          </span>
          <span class="cgpt-vs-miniItem cgpt-vs-atom" id="${TOP_POW_TAG_ID}" data-tooltip="${t('monitorPowTip')}">
            <span class="cgpt-vs-miniDot"></span>
            <span class="cgpt-vs-miniText">PoW</span>
          </span>
          <span class="cgpt-vs-miniItem cgpt-vs-atom" id="${TOP_OPT_TAG_ID}">
            <span class="cgpt-vs-miniDot"></span>
            <span class="cgpt-vs-miniText">Idle</span>
          </span>
          <span class="cgpt-vs-miniItem cgpt-vs-atom pause" id="${TOP_PAUSE_TAG_ID}" style="display:none;">
            <span class="cgpt-vs-miniDot"></span>
            <span class="cgpt-vs-miniText">Paused</span>
          </span>
        </span>
      </div>

      <div id="${PANEL_ID}" class="cgpt-vs-template">
        <section class="cgpt-vs-org cgpt-vs-organism cgpt-vs-org-status" data-org="status">
          <div class="cgpt-vs-sectionTitle">
            <span>${t('sectionStatus')}</span>
          </div>
          <div class="cgpt-vs-statusBar cgpt-vs-molecule">
            <div class="cgpt-vs-statusMain">
              <div class="cgpt-vs-statusText" data-k="statusMain">--</div>
              <div class="cgpt-vs-statusReason" id="${STATUS_REASON_ID}">--</div>
            </div>
          </div>
          <div class="cgpt-vs-toprow" style="margin-top:8px;">
            <div style="flex:1">
              <div class="cgpt-vs-seg cgpt-vs-molecule" aria-label="virtualization mode">
                <button class="cgpt-vs-atom" type="button" data-mode="performance">${lang === 'zh' ? '性能' : 'Performance'}</button>
                <button class="cgpt-vs-atom" type="button" data-mode="balanced">${lang === 'zh' ? '平衡' : 'Balanced'}</button>
                <button class="cgpt-vs-atom" type="button" data-mode="conservative">${lang === 'zh' ? '保守' : 'Conservative'}</button>
              </div>
            </div>
          </div>
        </section>

        <div class="cgpt-vs-layout cgpt-vs-template-body">
          <div class="cgpt-vs-col-left cgpt-vs-template-slot" data-template="left">
            <section class="cgpt-vs-org cgpt-vs-organism cgpt-vs-org-actions" data-org="actions">
              <div class="cgpt-vs-sectionTitle">
                <span>${t('sectionRuntime')}</span>
              </div>

              <div class="cgpt-vs-actionsGrid cgpt-vs-molecule">
                <div class="cgpt-vs-mol-group">
                  <div class="cgpt-vs-groupTitle">${lang === 'zh' ? '核心操作' : 'Primary Actions'}</div>
                  <div class="cgpt-vs-controls cgpt-vs-ops">
                    <div class="cgpt-vs-chiprow cgpt-vs-molecule">
                      <button class="cgpt-vs-chip cgpt-vs-atom primary" id="cgpt-vs-toggle">--</button>
                      <button class="cgpt-vs-chip cgpt-vs-atom" id="${OPTIMIZE_BTN_ID}" title="${t('optimizeSoftTip')}">${t('optimizeSoft')}</button>
                      <button class="cgpt-vs-chip cgpt-vs-atom" id="${SCROLL_LATEST_BTN_ID}" title="${t('scrollLatestTip')}">${t('scrollLatest')}</button>
                      <span class="cgpt-vs-chippair">
                        <button class="cgpt-vs-chip cgpt-vs-atom" id="${CHAT_EXPORT_BTN_ID}" title="${t('chatExportTip')}">${t('chatExport')}</button>
                        <button class="cgpt-vs-chip cgpt-vs-atom" id="cgpt-vs-newChat">${t('newChat')}</button>
                      </span>
                    </div>
                  </div>
                </div>

                <div class="cgpt-vs-mol-group">
                  <div class="cgpt-vs-groupTitle">${lang === 'zh' ? '策略与显示' : 'Strategy & View'}</div>
                  <div class="cgpt-vs-controls cgpt-vs-flags">
                    <div class="cgpt-vs-chiprow cgpt-vs-molecule">
                      <button class="cgpt-vs-chip cgpt-vs-atom" id="${AUTO_PAUSE_BTN_ID}" title="${t('autoPauseTip')}">--</button>
                      <button class="cgpt-vs-chip cgpt-vs-atom" id="cgpt-vs-pin" title="${pinMeta.title}" aria-label="${pinMeta.aria}" aria-pressed="${pinned ? 'true' : 'false'}">${pinMeta.label}</button>
                      <button class="cgpt-vs-chip cgpt-vs-atom" id="cgpt-vs-helpBtn" title="${t('help')}" aria-label="${t('help')}">${t('help')}</button>
                      <span class="cgpt-vs-chippair">
                        <button class="cgpt-vs-chip cgpt-vs-atom" id="${LOG_EXPORT_BTN_ID}" title="${t('logExportTip')}">${t('logExport')}</button>
                        <button class="cgpt-vs-chip cgpt-vs-atom" id="${DEG_REFRESH_BTN_ID}" title="${t('monitorRefreshTip')}">${t('monitorRefresh')}</button>
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </section>
            <section class="cgpt-vs-org cgpt-vs-organism cgpt-vs-org-mood" id="${MOOD_SECTION_ID}">
              <div class="cgpt-vs-sectionTitle">
                <span>${t('moodTitle')}</span>
              </div>
              <div class="cgpt-vs-moodText" id="${MOOD_TEXT_ID}">--</div>
              <div class="cgpt-vs-moodSub" id="${MOOD_SUB_ID}">--</div>
            </section>
          </div>

          <div class="cgpt-vs-col-right cgpt-vs-template-slot" data-template="right">
            <section class="cgpt-vs-org cgpt-vs-organism cgpt-vs-org-stats" data-org="stats">
              <div class="cgpt-vs-sectionTitle">
                <span>${t('sectionStats')}</span>
              </div>
              <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === 'zh' ? '运行模式' : 'Run Mode'}</span><span class="cgpt-vs-v" data-k="mode">--</span></div>
              <div class="cgpt-vs-row cgpt-vs-row-plan"><span class="cgpt-vs-k">${lang === 'zh' ? '动态规划' : 'Dynamic Plan'}</span><span class="cgpt-vs-v" data-k="plan">--</span></div>
              <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === 'zh' ? 'DOM节点' : 'DOM Nodes'}</span><span class="cgpt-vs-v" data-k="dom">--</span></div>
              <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === 'zh' ? '内存（JS堆）' : 'Memory (JS Heap)'}</span><span class="cgpt-vs-v" data-k="mem">--</span></div>
              <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === 'zh' ? '对话轮次' : 'Turns'}</span><span class="cgpt-vs-v" data-k="turns">--</span></div>
              <div class="cgpt-vs-row"><span class="cgpt-vs-k">${lang === 'zh' ? '预计剩余轮次' : 'Estimated Remaining Turns'}</span><span class="cgpt-vs-v" data-k="remain">--</span></div>
            </section>

            <section class="cgpt-vs-org cgpt-vs-organism cgpt-vs-org-monitor cgpt-vs-deg" id="${DEG_SECTION_ID}" data-org="monitor">
              <div class="cgpt-vs-sectionTitle">
                <span>${t('sectionMonitor')}</span>
              </div>
              <div class="cgpt-vs-deg-grid cgpt-vs-molecule">
                <div class="cgpt-vs-row">
                  <span class="cgpt-vs-k">${t('monitorService')}</span>
                  <div class="cgpt-vs-deg-value">
                    <span class="cgpt-vs-deg-tag cgpt-vs-atom" id="${DEG_SERVICE_TAG_ID}">--</span>
                    <span class="cgpt-vs-deg-text" id="${DEG_SERVICE_DESC_ID}" data-tooltip="${t('monitorServiceTip')}">--</span>
                  </div>
                </div>
                <div class="cgpt-vs-row">
                  <span class="cgpt-vs-k">${t('monitorIp')}</span>
                  <div class="cgpt-vs-deg-value">
                    <span class="cgpt-vs-deg-badge cgpt-vs-atom" id="${DEG_IP_BADGE_ID}" style="display:none;">warp</span>
                    <span class="cgpt-vs-deg-tag cgpt-vs-atom" id="${DEG_IP_TAG_ID}">--</span>
                    <span class="cgpt-vs-deg-text monospace" id="${DEG_IP_VALUE_ID}" data-tooltip="${t('monitorIpTip')}">--</span>
                  </div>
                </div>
                <div class="cgpt-vs-row">
                  <span class="cgpt-vs-k">${t('monitorPow')}</span>
                  <div class="cgpt-vs-deg-value">
                    <span class="cgpt-vs-deg-tag cgpt-vs-atom" id="${DEG_POW_TAG_ID}">--</span>
                    <span class="cgpt-vs-deg-text monospace" id="${DEG_POW_VALUE_ID}" data-tooltip="${t('monitorPowTip')}">--</span>
                  </div>
                </div>
                <div class="cgpt-vs-deg-bar" data-tooltip="${t('monitorPowTip')}">
                  <div class="cgpt-vs-deg-barInner" id="${DEG_POW_BAR_ID}"></div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div class="cgpt-vs-hr"></div>
        <div class="cgpt-vs-tip" data-k="tip">--</div>
      </div>
    `;

    document.body.appendChild(root);
    const help = ensureHelpLayer();

    applyThemeClass();
    refreshUiRefs(root);

    root.classList.toggle('open', RESTORE_LAST_OPEN && !!wasOpen);

    bindUI(root, help);
    applyPinnedState();
    updateMoodUI(true);
    refreshMoodFromApi();
    syncUiLayerPriority(true);

    return root;
  }

  function formatUIState(state) {
    return {
      modeLabel: modeLabel(state.mode),
      domLabel: Number.isFinite(state.dom) ? String(state.dom) : '--'
    };
  }

  function bindHelpUI(root, help) {
    if (!root || !help) return;
    const refs = getUiRefs(root);
    const helpBtn = refs ? refs.helpBtn : root.querySelector('#cgpt-vs-helpBtn');
    const helpClose = help.querySelector('#cgpt-vs-helpClose');
    if (helpBtn && helpBtn.dataset.helpBound !== '1') {
      helpBtn.dataset.helpBound = '1';
      helpBtn.addEventListener('click', () => help.classList.add('show'));
    }
    if (helpClose && helpClose.dataset.helpBound !== '1') {
      helpClose.dataset.helpBound = '1';
      helpClose.addEventListener('click', () => help.classList.remove('show'));
    }
    if (help.dataset.overlayBound !== '1') {
      help.dataset.overlayBound = '1';
      help.addEventListener('click', (e) => {
        if (e.target === help) help.classList.remove('show');
      });
    }
  }

  // ========================== UI：事件绑定 ==========================
  function bindUI(root, help) {
    const refs = getUiRefs(root);
    const btn = refs ? refs.btn : root.querySelector('#' + BTN_ID);
    const panel = refs ? refs.panel : root.querySelector('#' + PANEL_ID);
    const toggleBtn = refs ? refs.toggleBtn : root.querySelector('#cgpt-vs-toggle');
    const pinBtn = refs ? refs.pinBtn : root.querySelector('#cgpt-vs-pin');
    const optimizeBtn = refs ? refs.optimizeBtn : root.querySelector('#' + OPTIMIZE_BTN_ID);
    const newChatBtn = refs ? refs.newChatBtn : root.querySelector('#cgpt-vs-newChat');
    const autoPauseBtn = refs ? refs.autoPauseBtn : root.querySelector('#' + AUTO_PAUSE_BTN_ID);
    const scrollLatestBtn = refs ? refs.scrollLatestBtn : root.querySelector('#' + SCROLL_LATEST_BTN_ID);
    const chatExportBtn = refs ? refs.chatExportBtn : root.querySelector('#' + CHAT_EXPORT_BTN_ID);
    const logExportBtn = refs ? refs.logExportBtn : root.querySelector('#' + LOG_EXPORT_BTN_ID);
    if (!btn || !panel || !toggleBtn || !pinBtn || !newChatBtn) return;

    function setOpen(open) {
      root.classList.toggle('open', open);
      saveBool(KEY_LAST_OPEN, open);
      // Keep the top bar fixed while the panel is open to avoid vertical jitter.
      if (pinned || open) stopFollowPositionLoop();
      else startFollowPositionLoop();
      if (open) requestAnimationFrame(() => placeMoodSection());
    }

    btn.addEventListener('click', () => {
      if (root.classList.contains('dragging')) return;
      setOpen(!root.classList.contains('open'));
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(!root.classList.contains('open'));
      }
    });

    if (docClickHandler) {
      document.removeEventListener('click', docClickHandler, true);
    }
    docClickHandler = (e) => {
      const currentRoot = document.getElementById(ROOT_ID);
      if (!currentRoot || !currentRoot.classList.contains('open')) return;
      if (currentRoot.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('click', docClickHandler, true);

    panel.querySelectorAll('.cgpt-vs-seg button').forEach((b) => {
      b.addEventListener('click', () => {
        const mode = b.getAttribute('data-mode');
        if (mode !== 'performance' && mode !== 'balanced' && mode !== 'conservative') return;
        saveMode(mode);
        clearAutoHard('mode', getDomNodeCount());
        logEvent('info', 'mode', {
          mode
        });
        refreshSegUI(root);
        scheduleVirtualize();
        updateUI();
      });
    });

    toggleBtn.addEventListener('click', () => {
      virtualizationEnabled = !virtualizationEnabled;
      saveBool(KEY_ENABLED, virtualizationEnabled);
      clearAutoHard('toggle', getDomNodeCount());

      if (!virtualizationEnabled) unvirtualizeAll();
      else scheduleVirtualize();

      updateUI();
      logEvent('info', 'virtualization.toggle', {
        enabled: virtualizationEnabled
      });
    });

    bindHelpUI(root, help);

    pinBtn.addEventListener('click', () => {
      if (!pinned) {
        const rect = root.getBoundingClientRect();
        pinnedPos.x = clamp(Math.round(rect.left), 0, window.innerWidth - 40);
        pinnedPos.y = clamp(Math.round(rect.top), 0, window.innerHeight - 40);
        savePos();
      }
      pinned = !pinned;
      saveBool(KEY_PINNED, pinned);
      applyPinnedState();
      updateUI();
      logEvent('info', 'pin.toggle', {
        pinned
      });
    });

    if (autoPauseBtn) {
      autoPauseBtn.addEventListener('click', () => {
        setChatPause(!autoPauseOnChat);
      });
    }

    if (chatExportBtn) {
      chatExportBtn.addEventListener('click', () => {
        const prev = chatExportBtn.textContent;
        exportConversationToFile('ui');
        chatExportBtn.textContent = t('chatExported');
        setTimeout(() => {
          chatExportBtn.textContent = prev;
        }, 1200);
      });
    }

    if (logExportBtn) {
      logExportBtn.addEventListener('click', () => {
        const prev = logExportBtn.textContent;
        exportLogsToFile('ui');
        logExportBtn.textContent = t('logExported');
        setTimeout(() => {
          logExportBtn.textContent = prev;
        }, 1200);
      });
    }


    if (scrollLatestBtn) {
      scrollLatestBtn.addEventListener('click', () => {
        scrollToLatest();
        flashDot();
        logEvent('info', 'scroll.latest');
      });
    }

    if (optimizeBtn) {
      optimizeBtn.addEventListener('click', () => {
        runAutoOptimize('ui');
      });
    }

    newChatBtn.addEventListener('click', () => {
      const ok = tryClickNewChat();
      logEvent('info', 'newChat', {
        success: ok
      });
      if (!ok) PAGE_WIN.open(location.origin + '/', '_blank', 'noopener,noreferrer');
    });

    installDrag(root);
    refreshSegUI(root);

  }

  function refreshSegUI(root) {
    const panel = root.querySelector('#' + PANEL_ID);
    if (!panel) return;
    panel.querySelectorAll('.cgpt-vs-seg button').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-mode') === currentMode);
    });
  }

  function applyPinnedState() {
    const root = ensureRoot();
    root.classList.toggle('pinned', pinned);

    if (pinned) {
      stopFollowPositionLoop();
      const rect = root.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - Math.max(40, Math.round(rect.width || 0)));
      const maxY = Math.max(0, window.innerHeight - Math.max(40, Math.round(rect.height || 0)));
      const x = clamp(Math.round(Number(pinnedPos.x) || 0), 0, maxX);
      const y = clamp(Math.round(Number(pinnedPos.y) || 0), 0, maxY);
      pinnedPos.x = x;
      pinnedPos.y = y;
      savePos();
      root.style.left = `${x}px`;
      root.style.top = `${y}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }
    else {
      startFollowPositionLoop();
      positionNearModelButton();
    }
  }

  function installDrag(root) {
    let dragging = false;
    let startX = 0,
      startY = 0;
    let originX = 0,
      originY = 0;

    const btn = root.querySelector('#' + BTN_ID);
    if (!btn) return;

    btn.addEventListener('pointerdown', (e) => {
      if (!pinned) return;
      if (e.button !== 0) return;

      dragging = true;
      root.classList.add('dragging');
      btn.setPointerCapture(e.pointerId);

      startX = e.clientX;
      startY = e.clientY;

      const rect = root.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;

      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const nx = clamp(originX + dx, 0, window.innerWidth - 40);
      const ny = clamp(originY + dy, 0, window.innerHeight - 40);

      pinnedPos.x = nx;
      pinnedPos.y = ny;
      savePos();

      root.style.left = `${nx}px`;
      root.style.top = `${ny}px`;
    });

    btn.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('dragging');

      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener('pointercancel', () => {
      dragging = false;
      root.classList.remove('dragging');
    });
  }

  function flashDot() {
    const dot = document.getElementById(DOT_ID);
    if (!dot) return;
    dot.style.transform = 'scale(1.14)';
    setTimeout(() => {
      dot.style.transform = 'scale(1)';
    }, 140);
  }

  function scrollToLatest(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const behavior = opts.behavior === 'auto' ? 'auto' : 'smooth';
    const retries = clamp(Math.round(Number(opts.retries) || 0), 0, 6);
    const retryDelayMs = clamp(Math.round(Number(opts.retryDelayMs) || 220), 80, 2000);

    const doScroll = () => {
      const info = getScrollMetrics();
      const runScroll = (target, top) => {
        try {
          target.scrollTo({ top, behavior });
        }
        catch {
          target.scrollTo(0, top);
        }
      };

      if (info.isWindow) {
        const doc = document.scrollingElement || document.documentElement || document.body;
        const top = Math.max(0, (doc.scrollHeight || 0) - window.innerHeight);
        runScroll(window, top);
      }
      else if (info.root) {
        const rootEl = info.root;
        const top = Math.max(0, (rootEl.scrollHeight || 0) - (rootEl.clientHeight || 0));
        runScroll(rootEl, top);
      }

      setTimeout(() => scheduleVirtualize(), 160);
    };

    const runWithRetry = (attempt) => {
      doScroll();
      if (attempt >= retries) return;
      setTimeout(() => {
        const gap = getScrollBottomGap().gap;
        if (gap > 28) runWithRetry(attempt + 1);
      }, retryDelayMs);
    };

    runWithRetry(0);
  }

  function clearRouteAutoScrollTimer() {
    if (!routeAutoScrollTimer) return;
    clearTimeout(routeAutoScrollTimer);
    routeAutoScrollTimer = 0;
  }

  function scheduleRouteAutoScroll(reason) {
    clearRouteAutoScrollTimer();
    const trackKey = lastRouteKey;
    const delays = ROUTE_AUTO_SCROLL_DELAYS_MS.slice();
    const trigger = () => {
      if (trackKey && trackKey !== lastRouteKey) return;
      scrollToLatest({
        behavior: 'auto',
        retries: 1,
        retryDelayMs: 220
      });
      lastRouteAutoScrollAt = Date.now();
    };

    trigger();
    if (!delays.length) return;

    let idx = 0;
    const tick = () => {
      if (idx >= delays.length) {
        routeAutoScrollTimer = 0;
        return;
      }
      const delay = Math.max(0, Number(delays[idx]) || 0);
      idx += 1;
      routeAutoScrollTimer = setTimeout(() => {
        routeAutoScrollTimer = 0;
        trigger();
        tick();
      }, delay);
    };
    tick();
    logEvent('info', 'route.autoScroll', {
      reason: reason || 'route',
      routeKey: lastRouteKey || '',
      delays: ROUTE_AUTO_SCROLL_DELAYS_MS.join(',')
    });
  }

  function inspectRouteForAutoScroll(force) {
    const route = resolveConversationRouteInfo({
      url: location.href,
      fallbackPath: location.pathname || '/'
    });
    const decision = resolveRouteAutoScrollDecision({
      previousRouteKey: lastRouteKey,
      nextRouteKey: route.routeKey,
      now: Date.now(),
      lastAutoScrollAt: lastRouteAutoScrollAt,
      minIntervalMs: ROUTE_AUTO_SCROLL_MIN_INTERVAL_MS
    });

    if (decision.changed) {
      logEvent('info', 'route.change', {
        from: lastRouteKey || '',
        to: route.routeKey || '',
        conversationId: route.conversationId || ''
      });
      lastRouteKey = decision.routeKey;
      reclaimRuntimeCaches('route-change', {
        releaseNodeRefs: true,
        resetSoftObservers: true,
        resetMsgObserver: true
      });
      scrollRootAt = 0;
      installScrollHook();
    }
    else if (!lastRouteKey && route.routeKey) {
      lastRouteKey = route.routeKey;
    }

    if (!route.isConversation) {
      clearRouteAutoScrollTimer();
      return;
    }
    if (force || decision.shouldAutoScroll) {
      scheduleRouteAutoScroll(force ? 'force' : 'route-change');
    }
  }

  function tryClickNewChat() {
    const candidates = document.querySelectorAll('a, button, [role="button"]');
    for (const el of candidates) {
      const tx = ((el.innerText || el.textContent || '')).trim();
      if (!tx) continue;
      if (tx === '新聊天' || tx === 'New chat' || tx.includes('新对话') || tx.includes('New chat')) {
        try {
          el.click();
          return true;
        }
        catch {}
      }
    }
    return false;
  }

  function updateDegradedUI(root, degraded, refs) {
    if (!root) return;
    const ui = refs || getUiRefs(root);

    const refreshBtn = ui ? ui.degRefreshBtn : root.querySelector('#' + DEG_REFRESH_BTN_ID);
    if (refreshBtn) {
      refreshBtn.textContent = t('monitorRefresh');
      refreshBtn.title = t('monitorRefreshTip');
      if (refreshBtn.dataset.bound !== '1') {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', () => {
          ensureFetchHook();
          ensureXhrHook();
          refreshServiceStatus(true);
          refreshIPInfo(true);
          refreshPowViaRequirements(true);
        });
      }
    }

    const serviceDescEl = ui ? ui.degServiceDesc : root.querySelector('#' + DEG_SERVICE_DESC_ID);
    const serviceTagEl = ui ? ui.degServiceTag : root.querySelector('#' + DEG_SERVICE_TAG_ID);
    const serviceFresh = isFresh(degradedState.service.updatedAt, DEG_STATUS_TTL_MS);
    const serviceHasCache = !!(degradedState.service.description || degradedState.service.indicator);
    const serviceInfo = (serviceFresh || serviceHasCache) ?
      getServiceIndicatorInfo(degradedState.service.indicator, degradedState.service.description) :
      getServiceIndicatorInfo('', '');
    const serviceColor = (serviceFresh || serviceHasCache) ? serviceInfo.color : '#9ca3af';
    let serviceDesc = serviceFresh ? (degradedState.service.description || '--') :
      (serviceHasCache ? (degradedState.service.description || '--') : t('monitorUnknown'));
    let serviceTag = serviceFresh ?
      (degradedState.service.indicator === 'none' ? 'ok' : (degradedState.service.indicator || '--')) :
      (serviceHasCache ? (degradedState.service.indicator || '--') : '--');
    // Use compact Chinese labels for the mini tags in the top bar.
    if (lang === 'zh') {
      const compact = compactServiceLabel(degradedState.service.indicator);
      if (serviceFresh || serviceHasCache) {
        serviceTag = compact;
        if (degradedState.service.indicator === 'none') {
          serviceDesc = 'chat服务正常';
        }
        else if (degradedState.service.indicator === 'minor') {
          serviceDesc = '轻微波动';
        }
        else if (degradedState.service.indicator === 'major') {
          serviceDesc = '严重波动';
        }
        else if (degradedState.service.indicator === 'critical') {
          serviceDesc = '官方服务可能宕机';
        }
        else {
          serviceDesc = serviceFresh ? `服务${compact}` : (degradedState.service.description || `服务${compact}`);
        }
      }
      else {
        serviceDesc = t('monitorUnknown');
        serviceTag = t('monitorUnknown');
      }
    }
    const serviceOfficial = compactSingleLineText(
      degradedState.service.officialDescription || degradedState.service.description || '',
      120
    );
    const serviceIssueLines = Array.isArray(degradedState.service.issueLines)
      ? degradedState.service.issueLines.filter(Boolean)
      : [];
    const serviceIssueCount = Number.isFinite(Number(degradedState.service.issueCount))
      ? Number(degradedState.service.issueCount)
      : serviceIssueLines.length;
    const serviceTipLines = [t('monitorServiceTip')];
    if (serviceOfficial) {
      serviceTipLines.push(`${t('monitorServiceSummary')}: ${serviceOfficial}`);
    }
    if (serviceIssueLines.length) {
      const issueTitle = serviceIssueCount > 0 ? `${t('monitorServiceIssues')} (${serviceIssueCount})` : t('monitorServiceIssues');
      serviceTipLines.push(`${issueTitle}:`);
      serviceTipLines.push(...serviceIssueLines);
    }
    else if (serviceFresh && degradedState.service.indicator === 'none') {
      serviceTipLines.push(t('monitorServiceNoIssues'));
    }
    serviceTipLines.push(t('monitorOpenStatus'));
    if (!serviceFresh) serviceTipLines.push(getStaleHint(degradedState.service.updatedAt));
    const serviceTip = serviceTipLines.join('\n');
    if (serviceDescEl) {
      serviceDescEl.textContent = serviceDesc;
      serviceDescEl.style.color = serviceColor;
      serviceDescEl.setAttribute('data-tooltip', serviceTip);
      if (serviceDescEl.dataset.bound !== '1') {
        serviceDescEl.dataset.bound = '1';
        serviceDescEl.addEventListener('click', () => PAGE_WIN.open('https://status.openai.com', '_blank'));
      }
    }
    if (serviceTagEl) {
      serviceTagEl.textContent = serviceTag;
      paintDegradedTag(serviceTagEl, serviceColor);
      serviceTagEl.setAttribute('data-tooltip', serviceTip);
    }

    const ipEl = ui ? ui.degIpValue : root.querySelector('#' + DEG_IP_VALUE_ID);
    const ipTagEl = ui ? ui.degIpTag : root.querySelector('#' + DEG_IP_TAG_ID);
    const ipBadgeEl = ui ? ui.degIpBadge : root.querySelector('#' + DEG_IP_BADGE_ID);
    const ipQualityFresh = isFresh(degradedState.ip.qualityAt, DEG_IP_TTL_MS);
    const ipHasCache = !!(degradedState.ip.qualityLabel || degradedState.ip.qualityScore != null);
    const ipColor = ipQualityFresh ? degradedState.ip.qualityColor : '#9ca3af';
    const ipInfo = getIpRiskInfo(degradedState.ip.qualityScore);
    const ipTagLabel = ipQualityFresh ? (degradedState.ip.qualityLabel || ipInfo.label || t('monitorUnknown')) :
      (ipHasCache ? (degradedState.ip.qualityLabel || ipInfo.label || t('monitorUnknown')) : t('monitorUnknown'));
    const ipMiniLabel = ipQualityFresh ? (ipInfo.short || ipInfo.label || t('monitorUnknown')) :
      (ipHasCache ? (ipInfo.short || ipInfo.label || t('monitorUnknown')) : t('monitorUnknown'));
    const ipTip = (degradedState.ip.historyTooltip || degradedState.ip.qualityTooltip || t('monitorIpTip')) +
      (ipQualityFresh ? '' : `\n${getStaleHint(degradedState.ip.qualityAt)}`);
    if (ipEl) {
      ipEl.textContent = degradedState.ip.masked || '--';
      ipEl.style.color = ipColor;
      ipEl.setAttribute('data-tooltip', ipTip);
      if (!ipEl[DEG_IP_CLICK_KEY]) {
        ipEl[DEG_IP_CLICK_KEY] = true;
        ipEl.addEventListener('click', async () => {
          const historyText = formatIPLogs(getIPLogs());
          if (!historyText) return;
          const prev = ipEl.textContent;
          try {
            await navigator.clipboard.writeText(historyText);
            ipEl.textContent = t('monitorCopied');
          }
          catch {
            ipEl.textContent = t('monitorCopyFailed');
          }
          setTimeout(() => {
            ipEl.textContent = prev;
          }, 1200);
        });
      }
    }
    if (ipTagEl) {
      ipTagEl.textContent = ipTagLabel;
      paintDegradedTag(ipTagEl, ipColor);
      ipTagEl.setAttribute('data-tooltip', degradedState.ip.qualityTooltip || t('monitorIpTip'));
      if (ipTagEl.dataset.bound !== '1') {
        ipTagEl.dataset.bound = '1';
        ipTagEl.addEventListener('click', () => {
          if (!degradedState.ip.full) return;
          PAGE_WIN.open(`https://scamalytics.com/ip/${degradedState.ip.full}`, '_blank');
        });
      }
    }
    if (ipBadgeEl) {
      const warp = degradedState.ip.warp;
      const showWarp = warp === 'on' || warp === 'plus';
      ipBadgeEl.style.display = showWarp ? '' : 'none';
      if (showWarp) {
        ipBadgeEl.textContent = warp === 'plus' ? 'warp+' : 'warp';
        ipBadgeEl.setAttribute('data-tooltip', 'Cloudflare WARP detected');
      }
    }

    const powValueEl = ui ? ui.degPowValue : root.querySelector('#' + DEG_POW_VALUE_ID);
    const powTagEl = ui ? ui.degPowTag : root.querySelector('#' + DEG_POW_TAG_ID);
    const powBarEl = ui ? ui.degPowBar : root.querySelector('#' + DEG_POW_BAR_ID);
    const powFresh = isFresh(degradedState.pow.updatedAt, DEG_POW_TTL_MS);
    const powAvailable = !!degradedState.pow.updatedAt;
    const powColor = powFresh ? degradedState.pow.color : '#9ca3af';
    const powValue = powAvailable
      ? (degradedState.pow.difficulty || 'N/A')
      : t('monitorPowWaiting');
    let powLabel = powAvailable ? (degradedState.pow.levelLabel || t('monitorUnknown')) : t('monitorUnknown');
    // Use compact Chinese labels for the mini tags in the top bar.
    if (lang === 'zh') {
      const compact = compactRiskLabelByKey(degradedState.pow.levelKey);
      powLabel = powAvailable ? compact : t('monitorUnknown');
    }
    const powPct = powAvailable ? Math.max(0, Math.min(100, degradedState.pow.percentage || 0)) : 0;
    if (powValueEl) {
      powValueEl.textContent = powValue;
      powValueEl.style.color = powColor;
      powValueEl.setAttribute('data-tooltip', t('monitorPowTip') + (powFresh ? '' : `\n${getStaleHint(degradedState.pow.updatedAt)}`));
    }
    if (powTagEl) {
      powTagEl.textContent = powLabel;
      paintDegradedTag(powTagEl, powColor);
      powTagEl.setAttribute('data-tooltip', t('monitorPowTip') + (powFresh ? '' : `\n${getStaleHint(degradedState.pow.updatedAt)}`));
    }
    if (powBarEl) {
      powBarEl.style.width = `${powPct}%`;
      powBarEl.style.background = `linear-gradient(90deg, ${powColor}, ${powColor})`;
    }

    const topSvc = ui ? ui.topSvcTag : root.querySelector('#' + TOP_SVC_TAG_ID);
    const topIp = ui ? ui.topIpTag : root.querySelector('#' + TOP_IP_TAG_ID);
    const topPow = ui ? ui.topPowTag : root.querySelector('#' + TOP_POW_TAG_ID);
    const powMiniText = powAvailable ? powLabel : t('monitorPowWaiting');
    paintMiniItem(topSvc, formatMiniLabel('service', serviceTag), serviceColor, serviceTip);
    paintMiniItem(topIp, formatMiniLabel('ip', ipMiniLabel), ipColor, ipTip);
    paintMiniItem(topPow, formatMiniLabel('pow', powMiniText), powColor, t('monitorPowTip') + (powFresh ? '' : `\n${getStaleHint(degradedState.pow.updatedAt)}`));

    const section = ui ? ui.degSection : root.querySelector('#' + DEG_SECTION_ID);
    if (section) {
      section.classList.remove('warn', 'bad');
      if (degraded?.severity === 'bad') section.classList.add('bad');
      else if (degraded?.severity === 'warn') section.classList.add('warn');
    }
  }

  function scheduleDeferredFullUI() {
    if (deferredFullUiScheduled) return;
    deferredFullUiScheduled = true;
    const run = () => {
      deferredFullUiScheduled = false;
      updateUI(true);
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: INIT_LIGHT_UI_MS + 400 });
    }
    else {
      setTimeout(run, INIT_LIGHT_UI_MS);
    }
  }

  // ========================== UI：刷新面板数据 ==========================
  function updateUI(force) {
    if (document.hidden) return;
    const root = ensureRoot();
    const refs = getUiRefs(root);

    updateChatBusy(true);
    const now = Date.now();
    const open = root.classList.contains('open');
    const busy = autoPauseOnChat && chatBusy;
    const refreshDecision = resolveUiRefreshDecision({
      now,
      force: !!force,
      open,
      busy,
      uiCacheAt: uiCache.at,
      lastUiFullAt,
      sessionStartedAt: SESSION_STARTED_AT,
      initLightUiMs: INIT_LIGHT_UI_MS,
      fullRefreshOpenMs: UI_FULL_REFRESH_OPEN_MS,
      fullRefreshClosedMs: UI_FULL_REFRESH_CLOSED_MS,
      fullRefreshBusyMs: UI_FULL_REFRESH_BUSY_MS
    });
    const doFull = refreshDecision.doFull;
    const lightInit = refreshDecision.lightInit;

    let domNodes = 0;
    let usedMB = null;
    let plan = null;
    let turns = 0;

    if (lightInit) {
      domNodes = Number.NaN;
      usedMB = null;
      plan = uiCache.plan || marginCache;
      turns = uiCache.turns || lastTurnsCount || 0;
      scheduleDeferredFullUI();
    }
    else if (doFull) {
      domNodes = getDomNodeCount();
      usedMB = getUsedHeapMB();
      plan = getDynamicMargins();
      turns = getTurnsCountCached(false) || lastTurnsCount || 0;
      if (turns) lastTurnsCount = turns;
      uiCache = {
        at: now,
        domNodes,
        usedMB,
        turns,
        plan
      };
      lastUiFullAt = now;
    }
    else {
      domNodes = uiCache.domNodes;
      usedMB = uiCache.usedMB;
      plan = uiCache.plan || getDynamicMargins();
      turns = uiCache.turns || lastTurnsCount || 0;
    }

    const memInfo = memoryLevel(usedMB);
    const domInfo = domLevel(domNodes);
    const degraded = getDegradedHealth();
    const autoHardDom = plan.autoHardDom || AUTO_HARD_DOM_THRESHOLD;
    const autoHardExit = plan.autoHardExit || AUTO_HARD_EXIT_DOM;

    const virt = virtualizationEnabled ? (lastVirtualizedCount || 0) : 0;

    const remainTurns = estimateRemainingTurns(usedMB, turns);
    const remainText = (remainTurns == null) ? (lang === 'zh' ? '不可估算' : 'N/A') : (lang === 'zh' ? `${remainTurns} 轮左右` : `~${remainTurns} turns`);

    const pausedByChat = autoPauseOnChat && chatBusy;
    const pauseReason = getPauseReason();
    const displayPauseReason = (pauseReason === 'chat') ? '' : pauseReason;
    const paused = !!displayPauseReason;
    const loadReady = isAutoOptimizeReady(turns, currentMode);
    if (autoHardDom && virtualizationEnabled && !ctrlFFreeze && !pausedByChat && loadReady) {
      if (domNodes >= autoHardDom && !hardActive && (now - lastAutoHardAt) > AUTO_HARD_COOLDOWN_MS) {
        hardActive = true;
        hardActiveSource = 'auto';
        autoHardBelowAt = 0;
        lastAutoHardAt = now;
        logEvent('info', 'hard.auto', {
          domNodes,
          threshold: autoHardDom
        });
        scheduleVirtualize();
      }
    }
    if (virtualizationEnabled && hardActive && hardActiveSource === 'auto') {
      if (!loadReady) {
        if (clearAutoHard('auto', domNodes)) scheduleVirtualize();
      }
      else if (domNodes <= autoHardExit) {
        if (!autoHardBelowAt) autoHardBelowAt = now;
        if ((now - autoHardBelowAt) >= AUTO_HARD_EXIT_MS) {
          if (clearAutoHard('auto', domNodes)) scheduleVirtualize();
        }
      }
      else {
        autoHardBelowAt = 0;
      }
    }
    else {
      autoHardBelowAt = 0;
    }

    const gate = getOptimizeGateStatus(now, turns, domNodes, usedMB);

    if (optimizeGateReady == null) {
      optimizeGateReady = gate.ready;
    }
    else if (optimizeGateReady !== gate.ready) {
      optimizeGateReady = gate.ready;
      logEvent('info', 'optimize.gate', {
        ready: gate.ready,
        loadReady: gate.loadReady,
        manualOverride: gate.manualOverride,
        pressureReady: gate.pressureReady,
        pressureLevel: gate.pressureLevel,
        turns,
        domNodes,
        memMB: usedMB == null ? null : Number(usedMB.toFixed(1))
      });
      if (virtualizationEnabled && !ctrlFFreeze && !pausedByChat) {
        scheduleVirtualize();
      }
    }

    const worst = resolveWorstHealthLevel({
      virtualizationEnabled,
      memLevel: memInfo.level,
      domLevel: domInfo.level,
      degradedSeverity: degraded.severity
    });

    logHealthIfNeeded({
      worst,
      memLevel: memInfo.level,
      domLevel: domInfo.level,
      degradedSeverity: degraded.severity,
      serviceSev: degraded.serviceSev,
      ipSev: degraded.ipSev,
      powSev: degraded.powSev,
      turns,
      virt,
      enabled: virtualizationEnabled,
      ctrlF: ctrlFFreeze,
      chatBusy: pausedByChat,
      autoPause: autoPauseOnChat,
      memMB: usedMB == null ? null : Number(usedMB.toFixed(1)),
      domNodes
    });

    const dot = refs ? refs.dot : root.querySelector('#' + DOT_ID);
    if (dot) {
      dot.classList.remove('warn', 'bad', 'off');
      if (worst === 'warn') dot.classList.add('warn');
      if (worst === 'bad') dot.classList.add('bad');
      if (worst === 'off') dot.classList.add('off');
    }

    const statusLabel =
      worst === 'bad' ? (lang === 'zh' ? '危险' : 'Risk') :
      worst === 'warn' ? (lang === 'zh' ? '注意' : 'Caution') :
      worst === 'off' ? (lang === 'zh' ? '暂停' : 'Paused') :
      (lang === 'zh' ? '健康' : 'Healthy');
    const stateLabel = paused ? t('statePaused') : t('stateRunning');
    const topStatusText = `${modeLabel(currentMode)} · ${statusLabel}`;
    const panelStatusText = `${stateLabel} · ${statusLabel}`;
    const statusColor =
      worst === 'bad' ? '#ef4444' :
      worst === 'warn' ? '#f59e0b' :
      worst === 'off' ? '#9ca3af' :
      '#10b981';

    const mini = refs ? refs.statusText : root.querySelector('#' + STATUS_TEXT_ID);
    if (mini) {
      mini.textContent = topStatusText;
    }
    const statusPill = refs ? refs.statusPill : root.querySelector('#' + STATUS_PILL_ID);
    if (statusPill) {
      statusPill.classList.remove('ok', 'warn', 'bad', 'off');
      if (worst === 'bad') statusPill.classList.add('bad');
      else if (worst === 'warn') statusPill.classList.add('warn');
      else if (worst === 'off') statusPill.classList.add('off');
      else statusPill.classList.add('ok');
      paintMiniItem(statusPill, null, statusColor);
    }

    const statusMain = refs ? refs.statusMain : root.querySelector('[data-k="statusMain"]');
    if (statusMain) {
      statusMain.textContent = panelStatusText;
      statusMain.style.color = statusColor;
    }

    const reasonEl = refs ? refs.statusReason : root.querySelector('#' + STATUS_REASON_ID);
    if (reasonEl) {
      let reasonText = pauseReasonText(displayPauseReason);
      if (!paused) {
        const reasons = [];
        if (degraded.serviceSev === 'bad' || degraded.serviceSev === 'warn') reasons.push(t('monitorService'));
        if (degraded.ipSev === 'bad' || degraded.ipSev === 'warn') reasons.push(t('monitorIp'));
        if (degraded.powSev === 'bad' || degraded.powSev === 'warn') reasons.push(t('monitorPow'));
        if (reasons.length) {
          reasonText = lang === 'zh'
            ? `监控提示：${reasons.join(' / ')} 偏高`
            : `Monitor: ${reasons.join(' / ')} is elevated.`;
        }
      }
      reasonEl.textContent = reasonText;
    }

    const setText = (k, v) => {
      const cached = refs && refs.dataNodes ? refs.dataNodes[k] : null;
      const el = cached || root.querySelector(`[data-k="${k}"]`);
      if (refs && refs.dataNodes && !cached && el) refs.dataNodes[k] = el;
      if (el) el.textContent = v;
    };
    const escapeHtml = (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const setValueWithTag = (k, valueText, tagText, tagClass, groupClass) => {
      const cached = refs && refs.dataNodes ? refs.dataNodes[k] : null;
      const el = cached || root.querySelector(`[data-k="${k}"]`);
      if (refs && refs.dataNodes && !cached && el) refs.dataNodes[k] = el;
      if (!el) return;
      if (!tagText) {
        el.textContent = valueText;
        return;
      }
      const safeValue = escapeHtml(valueText);
      const safeTag = escapeHtml(tagText);
      const cls = tagClass ? ` ${tagClass}` : '';
      const groupCls = groupClass ? ` ${groupClass}` : '';
      el.innerHTML = `<span class="cgpt-vs-valueGroup${groupCls}"><span class="cgpt-vs-tag${cls}">${safeTag}</span><span class="cgpt-vs-valueText">${safeValue}</span></span>`;
    };
    const splitParenLabel = (raw) => {
      const text = String(raw || '').trim();
      const m = text.match(/^(.*?)[(（]\s*([^()（）]+?)\s*[)）]\s*$/);
      if (!m) return { value: text, tag: '' };
      return { value: m[1].trim(), tag: m[2].trim() };
    };

    const softScreens = plan.soft;
    const hardScreens = plan.hard;
    const showPlan = Number.isFinite(softScreens) && Number.isFinite(hardScreens);
    const uiState = formatUIState({ mode: currentMode, dom: domNodes });
    const modeText = uiState.modeLabel;
    const planText = showPlan
      ? (lang === 'zh'
        ? `硬×${hardScreens}屏/软×${softScreens}屏`
        : `Hard ×${hardScreens} / Soft ×${softScreens}`)
      : '--';
    setText('mode', modeText);
    const gateTag = (virtualizationEnabled && showPlan)
      ? (gate.ready ? t('optimizeReachedThreshold') : t('optimizeBelowThreshold'))
      : '';
    if (gateTag && showPlan) setValueWithTag('plan', planText, gateTag, gate.ready ? 'ok' : 'warn');
    else setText('plan', planText);
    const planEl = refs ? refs.planValue : root.querySelector('[data-k="plan"]');
    if (planEl && showPlan) {
      const desiredSoft = Number.isFinite(plan.desiredSoft) ? plan.desiredSoft : softScreens;
      const desiredHard = Number.isFinite(plan.desiredHard) ? plan.desiredHard : hardScreens;
      const nextStep = getNextMarginStep(turns);
      const nextPlan = (nextStep != null) ? planMarginsDP(nextStep, currentMode, null) : null;
      const overrideActive = plan.overrideUntil && now < plan.overrideUntil;
      const overrideRemaining = overrideActive ? formatDurationMs(Math.max(0, plan.overrideUntil - now)) : '';
      const lines = [];
      if (lang === 'zh') {
        lines.push(`当前轮次: ${turns}`);
        lines.push(`目标: 软${desiredSoft} / 硬${desiredHard}`);
        lines.push(`生效: 软${softScreens} / 硬${hardScreens}`);
        if (nextPlan && Number.isFinite(nextPlan.desiredSoft) && Number.isFinite(nextPlan.desiredHard)) {
          lines.push(`下一档: ${nextStep}轮 -> 软${nextPlan.desiredSoft} / 硬${nextPlan.desiredHard}`);
        }
        if (overrideActive) {
          lines.push(`临时覆盖: ${plan.overrideReason || 'optimize'}（剩余 ${overrideRemaining}）`);
        }
      }
      else {
        lines.push(`Turns: ${turns}`);
        lines.push(`Target: Soft ${desiredSoft} / Hard ${desiredHard}`);
        lines.push(`Active: Soft ${softScreens} / Hard ${hardScreens}`);
        if (nextPlan && Number.isFinite(nextPlan.desiredSoft) && Number.isFinite(nextPlan.desiredHard)) {
          lines.push(`Next: ${nextStep} turns -> Soft ${nextPlan.desiredSoft} / Hard ${nextPlan.desiredHard}`);
        }
        if (overrideActive) {
          lines.push(`Override: ${plan.overrideReason || 'optimize'} (${overrideRemaining} left)`);
        }
      }
      planEl.setAttribute('data-tooltip', lines.join('\n'));
    }
    else if (planEl) {
      planEl.removeAttribute('data-tooltip');
    }
    setText('dom', domInfo.label);

    const memEl = refs ? refs.memValue : root.querySelector('[data-k="mem"]');
    if (memEl) {
      memEl.classList.remove('mem-ok', 'mem-warn', 'mem-bad');
      const memParts = splitParenLabel(memInfo.label);
      const memClass =
        memInfo.level === 'ok' ? 'ok mem-ok' :
        memInfo.level === 'warn' ? 'warn mem-warn' :
        memInfo.level === 'bad' ? 'bad mem-bad' : '';
      if (memParts.tag) {
        setValueWithTag('mem', memParts.value, memParts.tag, memClass, 'tight');
      }
      else {
        memEl.textContent = memInfo.label;
        if (memClass) memEl.classList.add(memClass);
      }
    }

    setText('turns', `${turns}`);
    setText('remain', remainText);
    setText('tip', suggestionText(domNodes, usedMB, virt, turns));

    const toggleBtn = refs ? refs.toggleBtn : root.querySelector('#cgpt-vs-toggle');
    if (toggleBtn) {
      if (!virtualizationEnabled) {
        toggleBtn.textContent = lang === 'zh' ? '启用' : 'Enable';
        toggleBtn.classList.remove('active', 'paused');
      }
      else if (paused) {
        toggleBtn.textContent = lang === 'zh' ? '暂停中' : 'Paused';
        toggleBtn.classList.remove('active');
        toggleBtn.classList.add('paused');
      }
      else {
        toggleBtn.textContent = lang === 'zh' ? '暂停' : 'Pause';
        toggleBtn.classList.add('active');
        toggleBtn.classList.remove('paused');
      }
    }

    const pinBtn = refs ? refs.pinBtn : root.querySelector('#cgpt-vs-pin');
    if (pinBtn) {
      const pinMeta = getPinButtonMeta(pinned);
      pinBtn.textContent = pinMeta.label;
      pinBtn.title = pinMeta.title;
      pinBtn.setAttribute('aria-label', pinMeta.aria);
      pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      pinBtn.classList.toggle('is-pinned', pinned);
    }

    const optimizeBtn = refs ? refs.optimizeBtn : root.querySelector('#' + OPTIMIZE_BTN_ID);
    if (optimizeBtn) {
      optimizeBtn.textContent = t('optimizeSoft');
      optimizeBtn.title = t('optimizeSoftTip');
    }

    const newBtn = refs ? refs.newChatBtn : root.querySelector('#cgpt-vs-newChat');
    if (newBtn) newBtn.textContent = t('newChat');

    const autoPauseBtn = refs ? refs.autoPauseBtn : root.querySelector('#' + AUTO_PAUSE_BTN_ID);
    if (autoPauseBtn) {
      autoPauseBtn.textContent = autoPauseOnChat ?
        (lang === 'zh' ? `${t('autoPause')}：开` : `${t('autoPause')}: On`) :
        (lang === 'zh' ? `${t('autoPause')}：关` : `${t('autoPause')}: Off`);
      autoPauseBtn.title = t('autoPauseTip');
      autoPauseBtn.classList.toggle('active', autoPauseOnChat);
    }

    const logExportBtn = refs ? refs.logExportBtn : root.querySelector('#' + LOG_EXPORT_BTN_ID);
    if (logExportBtn) {
      logExportBtn.textContent = t('logExport');
      logExportBtn.title = t('logExportTip');
    }

    const chatExportBtn = refs ? refs.chatExportBtn : root.querySelector('#' + CHAT_EXPORT_BTN_ID);
    if (chatExportBtn) {
      chatExportBtn.textContent = t('chatExport');
      chatExportBtn.title = t('chatExportTip');
    }

    const latestBtn = refs ? refs.scrollLatestBtn : root.querySelector('#' + SCROLL_LATEST_BTN_ID);
    if (latestBtn) {
      latestBtn.textContent = t('scrollLatest');
      latestBtn.title = t('scrollLatestTip');
      latestBtn.classList.remove('active');
    }

    const pauseTag = refs ? refs.pauseTag : root.querySelector('#' + TOP_PAUSE_TAG_ID);
    if (pauseTag) {
      if (paused) {
        const label = pauseReasonLabel(displayPauseReason) || t('statePaused');
        pauseTag.style.display = '';
        pauseTag.classList.add('pause');
        paintMiniItem(pauseTag, label, '#f59e0b', pauseReasonText(displayPauseReason));
      }
      else {
        pauseTag.style.display = 'none';
        pauseTag.classList.remove('pause');
        pauseTag.removeAttribute('data-tooltip');
        paintMiniItem(pauseTag, null, null, null);
      }
    }

    const optTag = refs ? refs.optTag : root.querySelector('#' + TOP_OPT_TAG_ID);
    if (optTag) {
      const optimizing = isOptimizingNow();
      const yielding = pausedByChat;
      const label = yielding
        ? (lang === 'zh' ? '避让中' : 'Yielding')
        : (optimizing ? (lang === 'zh' ? '优化中' : 'Optimizing') : (lang === 'zh' ? '空闲' : 'Idle'));
      const color = yielding ? '#f59e0b' : (optimizing ? '#3b82f6' : '#9ca3af');
      optTag.classList.toggle('optimizing', optimizing && !yielding);
      optTag.classList.toggle('pause', yielding);
      const optTip = yielding
        ? (lang === 'zh' ? '回复生成中，优化已避让' : 'Assistant replying: optimization yields temporarily')
        : (optimizing ? (lang === 'zh' ? '正在优化渲染负载' : 'Optimization in progress') : (lang === 'zh' ? '未进行优化' : 'No optimization running'));
      paintMiniItem(optTag, formatMiniLabel('opt', label), color, optTip);
    }

    placeMoodSection();
    updateMoodUI(false);
    updateDegradedUI(root, degraded, refs);
    if (root.classList.contains('booting')) {
      root.classList.remove('booting');
    }
  }

  // endregion: UI Render & Bindings
  // region: Route Guards & Boot
  // ========================== 路由守护：切换对话不消失 ==========================
  function startRouteGuards() {
    setInterval(() => {
      const root = document.getElementById(ROOT_ID);
      if (!root || !document.body.contains(root)) {
        try {
          uiRefs = null;
          reclaimRuntimeCaches('route-rebuild', {
            releaseNodeRefs: true,
            resetSoftObservers: true,
            resetMsgObserver: true
          });
          logEvent('warn', 'route.rebuild', {
            reason: !root ? 'missing' : 'detached'
          });
          ensureRoot();
          applyPinnedState();
          updateUI();
          scheduleVirtualize();
          if (pinned) stopFollowPositionLoop();
          else startFollowPositionLoop();
          inspectRouteForAutoScroll(false);
        }
        catch {}
      }
      else {
        // Avoid moving the top bar while the panel is open.
        if (!pinned && !root.classList.contains('open')) positionNearModelButton();
        ensureThemeObservation();
        installScrollHook();
        inspectRouteForAutoScroll(false);
      }
    }, ROUTE_GUARD_MS);
  }

  // ========================== 启动 ==========================
  function boot() {
    PAGE_WIN.CGPT_VS = PAGE_WIN.CGPT_VS || {};
    PAGE_WIN.CGPT_VS.dump = dumpLogs;
    PAGE_WIN.CGPT_VS.exportLogs = exportLogsToFile;
    PAGE_WIN.CGPT_VS.exportConversation = exportConversationToFile;
    PAGE_WIN.CGPT_VS.setLogLevel = setLogLevel;
    PAGE_WIN.CGPT_VS.setLogConsole = setLogConsole;
    PAGE_WIN.CGPT_VS.getState = getStateSnapshot;
    PAGE_WIN.CGPT_VS.selfCheck = () => SelfCheck.run();
    PAGE_WIN.CGPT_VS.setChatPause = setChatPause;
    PAGE_WIN.CGPT_VS.scrollToLatest = scrollToLatest;
    PAGE_WIN.CGPT_VS.refreshMonitor = () => {
      Monitor.refreshAll(true, { pow: true });
    };

    logEvent('info', 'boot.start', {
      version: SCRIPT_VERSION,
      url: location.href,
      lang,
      mode: currentMode,
      enabled: virtualizationEnabled,
      pinned,
      autoPauseOnChat,
      logLevel,
      logToConsole,
      hint: 'Run CGPT_VS.dump() when lag occurs.'
    });

    applyDegradedCache(loadDegradedCache());
    if (!degradedState.ip.historyTooltip) updateIpHistoryTooltip();

    ensureRoot();
    startLayerPrioritySync();
    inspectRouteForAutoScroll(true);
    startThemeObserver();
    startDegradedMonitors();
    applyPinnedState();
    if (pinned) stopFollowPositionLoop();
    else startFollowPositionLoop();

    installFindGuards();
    installTypingDim();
    installImageLoadHook();
    installResizeFix();
    startRouteGuards();

    installScrollHook();

    const kickVirtualize = () => scheduleVirtualize();
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(kickVirtualize, { timeout: INIT_LIGHT_UI_MS + 400 });
    }
    else {
      setTimeout(kickVirtualize, INIT_VIRTUALIZE_DELAY_MS);
    }
    updateUI();

    setInterval(() => updateUI(), CHECK_INTERVAL_MS);
    logEvent('info', 'boot.ready');

    PAGE_WIN.addEventListener('error', (e) => {
      if (!e) return;
      logEvent('warn', 'window.error', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno
      });
    });

    window.addEventListener('unhandledrejection', (e) => {
      const reason = e && e.reason ? String(e.reason) : 'unknown';
      logEvent('warn', 'window.unhandledRejection', {
        reason
      });
    });
  }

  let booted = false;
  function safeBoot() {
    if (booted) return;
    if (!document.body) {
      setTimeout(safeBoot, 200);
      return;
    }
    booted = true;
    boot();
  }

  try {
    Monitor.installHooks();
    startFetchMonitor();
  }
  catch {}

  setTimeout(safeBoot, 900);
  // endregion: Route Guards & Boot
})();
}

