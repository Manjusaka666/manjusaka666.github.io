"use strict";

(() => {
  if (window.__horseLotteryModuleLoaded) {
    if (typeof window.__horseLotteryMount === "function") {
      window.__horseLotteryMount();
    }
    return;
  }
  window.__horseLotteryModuleLoaded = true;

  const APP_SELECTOR = "[data-horse-lottery-app]";
  const MAX_RECORDS = 300;

  const STORAGE_KEYS = {
    pool: "horse-lottery-pool-v3",
    records: "horse-lottery-records-v3",
    hostPin: "horse-lottery-host-pin-v1",
    hostUnlocked: "horse-lottery-host-unlocked-v1",
  };

  const DEFAULT_HOST_PIN = "pony2026";

  const DEFAULT_PRIZE_POOL = [
    { id: "p01", name: "公主的星光好运包", detail: "马年好运红包礼物 1 份", weight: 9, enabled: true },
    { id: "p02", name: "哆哆的跳跳好运包", detail: "马年好运红包礼物 1 份", weight: 10, enabled: true },
    { id: "p03", name: "西西的绵绵好运包", detail: "马年好运红包礼物 1 份 + 专属祝福卡", weight: 9, enabled: true },
    { id: "p04", name: "公主的云锦丝巾礼", detail: "南京云锦丝巾礼盒 1 份", weight: 10, enabled: true },
    { id: "p05", name: "哆哆的雨花石愿望礼", detail: "南京雨花石文创摆件礼盒 1 份", weight: 10, enabled: true },
    { id: "p06", name: "西西的金陵折扇礼", detail: "金陵折扇手作礼盒 1 份", weight: 10, enabled: true },
    { id: "p07", name: "公主的秦淮灯彩礼", detail: "秦淮灯彩手作小灯 1 份", weight: 10, enabled: true },
    { id: "p08", name: "哆哆的香囊平安礼", detail: "南京香囊与流苏挂件套装 1 份", weight: 11, enabled: true },
    { id: "p09", name: "西西的文具心愿礼", detail: "高颜值手帐文具礼盒 1 份", weight: 11, enabled: true },
    { id: "p10", name: "公主哆哆西西终极礼", detail: "马年好运红包礼物 + 新春纪念周边套装", weight: 10, enabled: true },
  ];

  function cloneDefaultPool() {
    return DEFAULT_PRIZE_POOL.map((item) => ({ ...item }));
  }

  function safeJSONParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function readFromStorage(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return safeJSONParse(raw, fallback);
  }

  function writeToStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizePrizeItem(item, index) {
    const fallback = DEFAULT_PRIZE_POOL[index] || DEFAULT_PRIZE_POOL[0];
    const weightNumber = Number(item?.weight);
    return {
      id: item?.id || fallback.id,
      name: String(item?.name || fallback.name).slice(0, 36),
      detail: String(item?.detail || fallback.detail).slice(0, 240),
      weight: Number.isFinite(weightNumber) && weightNumber >= 0 ? weightNumber : fallback.weight,
      enabled: item?.enabled !== false,
    };
  }

  function loadPrizePool() {
    const saved = readFromStorage(STORAGE_KEYS.pool, null);
    if (!Array.isArray(saved) || saved.length !== DEFAULT_PRIZE_POOL.length) {
      const defaults = cloneDefaultPool();
      writeToStorage(STORAGE_KEYS.pool, defaults);
      return defaults;
    }

    const normalized = saved.map((item, index) => normalizePrizeItem(item, index));
    writeToStorage(STORAGE_KEYS.pool, normalized);
    return normalized;
  }

  function loadRecords() {
    const saved = readFromStorage(STORAGE_KEYS.records, []);
    if (!Array.isArray(saved)) {
      return [];
    }

    return saved
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Number(item.timestamp) || Date.now(),
        playerName: String(item.playerName || "神秘朋友"),
        prizeName: String(item.prizeName || "未知奖项"),
        prizeDetail: String(item.prizeDetail || "未填写具体内容"),
      }))
      .slice(0, MAX_RECORDS);
  }

  function loadHostPin() {
    const saved = localStorage.getItem(STORAGE_KEYS.hostPin);
    return saved && saved.trim() ? saved : DEFAULT_HOST_PIN;
  }

  function pickPrize(pool) {
    const candidates = pool.filter((item) => item.enabled && item.weight > 0 && item.name.trim());
    if (!candidates.length) {
      return null;
    }

    const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of candidates) {
      random -= item.weight;
      if (random <= 0) {
        return item;
      }
    }
    return candidates[candidates.length - 1];
  }

  function formatTimestamp(value) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setMessage(element, message, type = "") {
    if (!element) {
      return;
    }
    element.textContent = message || "";
    element.classList.remove("success", "error");
    if (type) {
      element.classList.add(type);
    }
  }

  function createRecordId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function downloadRecords(records) {
    const payload = JSON.stringify(records, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    link.href = URL.createObjectURL(blob);
    link.download = `horse-lottery-records-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  function renderPoolEditor(container, pool) {
    container.innerHTML = "";

    pool.forEach((prize, index) => {
      const item = document.createElement("article");
      item.className = "pool-item";
      item.dataset.index = String(index);

      item.innerHTML = `
        <div class="pool-item-header">
          <span class="pool-item-index">奖项 ${index + 1}</span>
          <label class="pool-item-toggle">
            <input type="checkbox" data-field="enabled" ${prize.enabled ? "checked" : ""}>
            启用
          </label>
        </div>
        <div class="pool-field-grid">
          <label>
            显示名称（朋友可见）
            <input type="text" data-field="name" maxlength="36" value="${escapeHTML(prize.name)}">
          </label>
          <label>
            具体内容（仅主持人可见）
            <textarea data-field="detail" maxlength="240">${escapeHTML(prize.detail)}</textarea>
          </label>
          <label>
            权重（0 表示不会抽中）
            <input type="number" min="0" step="1" data-field="weight" value="${String(prize.weight)}">
          </label>
        </div>
      `;

      container.appendChild(item);
    });
  }

  function collectPoolFromEditor(container, currentPool) {
    const items = Array.from(container.querySelectorAll(".pool-item"));
    const nextPool = items.map((item, index) => {
      const nameInput = item.querySelector('[data-field="name"]');
      const detailInput = item.querySelector('[data-field="detail"]');
      const weightInput = item.querySelector('[data-field="weight"]');
      const enabledInput = item.querySelector('[data-field="enabled"]');

      const rawWeight = Number(weightInput?.value ?? 0);
      return {
        id: currentPool[index]?.id || `p${String(index + 1).padStart(2, "0")}`,
        name: String(nameInput?.value || "").trim().slice(0, 36),
        detail: String(detailInput?.value || "").trim().slice(0, 240),
        weight: Number.isFinite(rawWeight) && rawWeight >= 0 ? Math.floor(rawWeight) : 0,
        enabled: Boolean(enabledInput?.checked),
      };
    });

    const hasDrawable = nextPool.some((item) => item.enabled && item.weight > 0 && item.name);
    if (!hasDrawable) {
      return { error: "至少保留 1 个启用且权重大于 0 的奖项。" };
    }

    const filled = nextPool.map((item, index) => ({
      ...item,
      name: item.name || `神秘奖项 ${index + 1}`,
      detail: item.detail || "待主持人补充",
    }));

    return { pool: filled };
  }

  function renderRecords(container, records) {
    container.innerHTML = "";
    if (!records.length) {
      const empty = document.createElement("li");
      empty.className = "record-empty";
      empty.textContent = "还没有抽奖记录。";
      container.appendChild(empty);
      return;
    }

    records.forEach((record) => {
      const item = document.createElement("li");
      item.className = "record-list-item";

      const main = document.createElement("p");
      main.className = "record-main";
      main.textContent = `${record.playerName} 抽中「${record.prizeName}」`;

      const meta = document.createElement("p");
      meta.className = "record-meta";
      meta.textContent = `${formatTimestamp(record.timestamp)} · 内容：${record.prizeDetail}`;

      item.appendChild(main);
      item.appendChild(meta);
      container.appendChild(item);
    });
  }

  function initLotteryApp(app) {
    if (app.dataset.inited === "true") {
      return;
    }
    app.dataset.inited = "true";

    const playerInput = app.querySelector("#lottery-player-name");
    const drawButton = app.querySelector('[data-action="draw"]');
    const resultName = app.querySelector('[data-role="result-name"]');

    const hostAuth = app.querySelector('[data-role="host-auth"]');
    const hostPanel = app.querySelector('[data-role="host-panel"]');
    const hostPinInput = app.querySelector("#lottery-host-pin");
    const authMessage = app.querySelector('[data-role="auth-message"]');
    const poolStatus = app.querySelector('[data-role="pool-status"]');
    const pinStatus = app.querySelector('[data-role="pin-status"]');
    const poolEditor = app.querySelector('[data-role="pool-editor"]');
    const recordsList = app.querySelector('[data-role="record-list"]');
    const newPinInput = app.querySelector('[data-role="new-pin"]');

    const hostAuthButton = app.querySelector('[data-action="show-host-auth"]');
    const unlockButton = app.querySelector('[data-action="unlock-host"]');
    const lockButton = app.querySelector('[data-action="lock-host"]');
    const savePoolButton = app.querySelector('[data-action="save-pool"]');
    const resetPoolButton = app.querySelector('[data-action="reset-pool"]');
    const exportRecordsButton = app.querySelector('[data-action="export-records"]');
    const clearRecordsButton = app.querySelector('[data-action="clear-records"]');
    const savePinButton = app.querySelector('[data-action="save-pin"]');

    if (!drawButton || !resultName || !poolEditor || !recordsList) {
      return;
    }

    let pool = loadPrizePool();
    let records = loadRecords();
    let hostUnlocked = sessionStorage.getItem(STORAGE_KEYS.hostUnlocked) === "1";

    function persistPool(nextPool) {
      pool = nextPool.map((item, index) => normalizePrizeItem(item, index));
      writeToStorage(STORAGE_KEYS.pool, pool);
    }

    function persistRecords(nextRecords) {
      records = nextRecords.slice(0, MAX_RECORDS);
      writeToStorage(STORAGE_KEYS.records, records);
    }

    function showHostPanel(visible) {
      hostUnlocked = visible;
      if (visible) {
        sessionStorage.setItem(STORAGE_KEYS.hostUnlocked, "1");
        hostPanel?.classList.remove("hidden");
        hostAuth?.classList.add("hidden");
        setMessage(authMessage, "已进入主持模式。", "success");
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.hostUnlocked);
        hostPanel?.classList.add("hidden");
      }
    }

    function drawOnce() {
      const picked = pickPrize(pool);
      if (!picked) {
        resultName.textContent = "奖池暂不可用";
        resultName.style.color = "#b53f5a";
        return;
      }

      const playerName = playerInput?.value?.trim() || "神秘朋友";
      resultName.textContent = picked.name;
      resultName.style.color = "";

      if (typeof resultName.animate === "function") {
        resultName.animate(
          [
            { transform: "scale(0.98)", opacity: 0.4 },
            { transform: "scale(1.06)", opacity: 1 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }

      const nextRecords = [
        {
          id: createRecordId(),
          timestamp: Date.now(),
          playerName,
          prizeName: picked.name,
          prizeDetail: picked.detail,
        },
        ...records,
      ];

      persistRecords(nextRecords);
      renderRecords(recordsList, records);
    }

    drawButton?.addEventListener("click", drawOnce);
    playerInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        drawOnce();
      }
    });

    hostAuthButton?.addEventListener("click", () => {
      if (hostUnlocked) {
        hostPanel?.classList.remove("hidden");
        return;
      }
      hostAuth?.classList.toggle("hidden");
      hostPinInput?.focus();
      setMessage(authMessage, "");
    });

    unlockButton?.addEventListener("click", () => {
      const currentPin = loadHostPin();
      const inputPin = hostPinInput?.value?.trim() || "";
      if (!inputPin) {
        setMessage(authMessage, "请输入主持人口令。", "error");
        return;
      }

      if (inputPin !== currentPin) {
        setMessage(authMessage, "口令不正确。", "error");
        return;
      }

      showHostPanel(true);
      if (hostPinInput) {
        hostPinInput.value = "";
      }
      renderPoolEditor(poolEditor, pool);
      renderRecords(recordsList, records);
    });

    lockButton?.addEventListener("click", () => {
      showHostPanel(false);
      setMessage(authMessage, "已退出主持模式。");
    });

    savePoolButton?.addEventListener("click", () => {
      const result = collectPoolFromEditor(poolEditor, pool);
      if (result.error) {
        setMessage(poolStatus, result.error, "error");
        return;
      }

      persistPool(result.pool);
      renderPoolEditor(poolEditor, pool);
      setMessage(poolStatus, "奖池已保存。", "success");
    });

    resetPoolButton?.addEventListener("click", () => {
      const confirmed = window.confirm("确定恢复默认奖池吗？");
      if (!confirmed) {
        return;
      }
      persistPool(cloneDefaultPool());
      renderPoolEditor(poolEditor, pool);
      setMessage(poolStatus, "已恢复默认奖池。", "success");
    });

    exportRecordsButton?.addEventListener("click", () => {
      if (!records.length) {
        setMessage(poolStatus, "暂无记录可导出。", "error");
        return;
      }
      downloadRecords(records);
      setMessage(poolStatus, "已导出记录 JSON。", "success");
    });

    clearRecordsButton?.addEventListener("click", () => {
      const confirmed = window.confirm("确定清空所有抽奖记录吗？");
      if (!confirmed) {
        return;
      }
      persistRecords([]);
      renderRecords(recordsList, records);
      setMessage(poolStatus, "记录已清空。", "success");
    });

    savePinButton?.addEventListener("click", () => {
      const nextPin = newPinInput?.value?.trim() || "";
      if (nextPin.length < 4) {
        setMessage(pinStatus, "新口令至少 4 位。", "error");
        return;
      }
      localStorage.setItem(STORAGE_KEYS.hostPin, nextPin);
      if (newPinInput) {
        newPinInput.value = "";
      }
      setMessage(pinStatus, "主持人口令已更新。", "success");
    });

    if (hostUnlocked) {
      showHostPanel(true);
    }

    renderPoolEditor(poolEditor, pool);
    renderRecords(recordsList, records);
  }

  function mountLotteryPage() {
    document.querySelectorAll(APP_SELECTOR).forEach(initLotteryApp);
  }

  window.__horseLotteryMount = mountLotteryPage;

  document.addEventListener("DOMContentLoaded", mountLotteryPage);
  try {
    swup.hooks.on("page:view", mountLotteryPage);
  } catch {
    // swup may not exist depending on global setting.
  }

  mountLotteryPage();
})();
