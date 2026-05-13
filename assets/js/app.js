(function () {
  "use strict";

  const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw9A4n_9XskiPQidcaZLSbkweI1BXG_QMywC5BXnIUv_YIOVEyhu5VlYPid0yuxJtuZ/exec";
  const SETTINGS_KEY = "ndhu.learning.anan.settings.v2";
  const CONSENT_KEY = "ndhu.learning.anan.usageConsent.v4";
  const SESSION_COUNT_KEY = "ndhu.learning.anan.sessionCount.v1";
  const AUTH_STORE_KEY = "ndhu.learning.anan.students.v1";
  const CURRENT_USER_KEY = "ndhu.learning.anan.currentStudent.v1";
  const DAILY_TURN_KEY = "ndhu.learning.anan.dailyTurns.v1";
  const DAILY_TURN_LIMIT = 25;
  const LLM_TIMEOUT_MS = 90000;
  const LIMIT_DIALOG_TEXT = "同學您好，您的問題可以進一步洽詢學校導師、行政人員或心理諮商中心，相信可以獲得更好的協助。";
  const DEFAULT_SETTINGS = { gasEndpoint: GAS_ENDPOINT };
  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    messages: [],
    sessionNumber: 0,
    reportAnalysis: "",
    students: [],
    authMode: "register",
    profile: {
      nickname: "",
      email: "",
      studentId: "",
      grade: "",
      college: "",
      department: ""
    }
  };

  let speechRecognition = null;
  let isListening = false;
  let nextInputMethod = "text";

  const $ = (selector, root = document) => root.querySelector(selector);

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeText(value, fallback = "") {
    const text = value === undefined || value === null ? "" : String(value).trim();
    return text || fallback;
  }

  function normalizeEmail(value) {
    return safeText(value).toLowerCase();
  }

  function uid(prefix) {
    const random = window.crypto && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint16Array(2))).map((n) => n.toString(36)).join("")
      : Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
  }

  async function digestText(value) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      const data = new TextEncoder().encode(value);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(index);
      hash |= 0;
    }
    return `fallback-${Math.abs(hash).toString(16)}`;
  }

  function publicStudent(student) {
    const copy = Object.assign({}, student || {});
    delete copy.passwordHash;
    delete copy.passwordSalt;
    return copy;
  }

  async function hashSecret(secret, salt) {
    return digestText(`${salt}:${secret}`);
  }

  function iconRefresh() {
    if (window.lucide) window.lucide.createIcons();
  }

  function isoTime(value) {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function formatMessageTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      state.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    } catch (err) {
      state.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
    state.settings.gasEndpoint = GAS_ENDPOINT;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function loadAuthState() {
    try {
      const stored = JSON.parse(localStorage.getItem(AUTH_STORE_KEY) || "[]");
      state.students = Array.isArray(stored) ? stored : [];
    } catch (err) {
      state.students = [];
    }

    try {
      const current = JSON.parse(sessionStorage.getItem(CURRENT_USER_KEY) || "null");
      if (current && current.email) state.profile = Object.assign({}, state.profile, current);
    } catch (err) {
      sessionStorage.removeItem(CURRENT_USER_KEY);
    }
  }

  function saveStudents() {
    localStorage.setItem(AUTH_STORE_KEY, JSON.stringify(state.students));
  }

  function findStudent(email) {
    const normalized = normalizeEmail(email);
    return state.students.find((student) => normalizeEmail(student.email) === normalized);
  }

  function setCurrentStudent(student) {
    const publicProfile = publicStudent(student);
    state.profile = {
      nickname: safeText(publicProfile.nickname || publicProfile.name, "同學"),
      email: normalizeEmail(publicProfile.email),
      studentId: normalizedStudentId(publicProfile.studentId || publicProfile.id),
      grade: safeText(publicProfile.grade),
      college: safeText(publicProfile.college),
      department: safeText(publicProfile.department)
    };
    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(state.profile));
  }

  function showToast(message) {
    const region = $("#toastRegion");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }

  function showView(viewId) {
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("hidden", view.id !== viewId);
    });
    if (viewId === "entryView") {
      window.setTimeout(() => {
        const firstInput = state.authMode === "login" ? $("#emailInput") : $("#nicknameInput");
        if (firstInput) firstInput.focus();
      }, 80);
    }
    if (viewId === "chatView") {
      window.setTimeout(() => $("#chatInput").focus(), 80);
    }
    iconRefresh();
  }

  function normalizedStudentId(value = state.profile.studentId) {
    return safeText(value).toUpperCase().replace(/\s+/g, "");
  }

  function nextSessionNumber() {
    const identity = normalizeEmail(state.profile.email) || normalizedStudentId() || "UNKNOWN";
    const key = `${SESSION_COUNT_KEY}.${identity}`;
    const current = Number.parseInt(localStorage.getItem(key) || "0", 10);
    const next = Number.isFinite(current) ? current + 1 : 1;
    localStorage.setItem(key, String(next));
    return next;
  }

  function todayKey() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  }

  function dailyTurnStorageKey(email = state.profile.email) {
    return `${DAILY_TURN_KEY}.${normalizeEmail(email) || "unknown"}.${todayKey()}`;
  }

  function getDailyTurnCount(email = state.profile.email) {
    const count = Number.parseInt(localStorage.getItem(dailyTurnStorageKey(email)) || "0", 10);
    return Number.isFinite(count) ? count : 0;
  }

  function setDailyTurnCount(count, email = state.profile.email) {
    localStorage.setItem(dailyTurnStorageKey(email), String(Math.max(0, Number(count) || 0)));
  }

  function incrementDailyTurnCount(email = state.profile.email) {
    const next = getDailyTurnCount(email) + 1;
    setDailyTurnCount(next, email);
    return next;
  }

  function hasReachedDailyLimit() {
    return getDailyTurnCount() >= DAILY_TURN_LIMIT;
  }

  function showLimitDialog() {
    const dialog = $("#limitDialog");
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
      return;
    }
    window.alert(LIMIT_DIALOG_TEXT);
  }

  function setupUsageConsent() {
    const check = $("#usageConsentCheck");
    const button = $("#usageConsentButton");
    const form = $("#usageConsentForm");
    if (!check || !button || !form) return;

    function openConsentOverlay() {
      showView("entryView");
      check.checked = false;
      button.disabled = true;
      $("#consentView").classList.remove("hidden");
      window.setTimeout(() => check.focus(), 80);
    }

    check.addEventListener("change", () => {
      button.disabled = !check.checked;
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!check.checked) return;
      localStorage.setItem(CONSENT_KEY, "accepted");
      $("#consentView").classList.add("hidden");
      showView("entryView");
    });

    openConsentOverlay();
  }

  function populateProfileOptions() {
    const collegeSelect = $("#collegeSelect");
    const departmentSelect = $("#departmentSelect");
    if (!collegeSelect || !departmentSelect) return;

    const colleges = (window.NDHULearningData && window.NDHULearningData.colleges) || [];
    collegeSelect.innerHTML = colleges
      .map((college) => `<option value="${escapeHtml(college.name)}">${escapeHtml(college.name)}</option>`)
      .join("");

    function updateDepartments() {
      const selected = colleges.find((college) => college.name === collegeSelect.value) || colleges[0];
      const departments = selected ? selected.departments : [];
      departmentSelect.innerHTML = departments
        .map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`)
        .join("");
    }

    const educationCollege = colleges.find((college) => college.name === "花師教育學院");
    if (educationCollege) collegeSelect.value = educationCollege.name;
    updateDepartments();
    collegeSelect.addEventListener("change", updateDepartments);
  }

  function setAuthMode(mode) {
    state.authMode = mode === "login" ? "login" : "register";
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      const active = button.dataset.authMode === state.authMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    syncAuthFormState();
  }

  function syncAuthFormState() {
    const isRegister = state.authMode === "register";
    document.querySelectorAll("[data-register-only]").forEach((node) => {
      node.classList.toggle("hidden", !isRegister);
      node.querySelectorAll("input, select, textarea").forEach((control) => {
        if (control.dataset.wasRequired === undefined) control.dataset.wasRequired = control.required ? "true" : "false";
        control.disabled = !isRegister;
        control.required = isRegister && control.dataset.wasRequired === "true";
      });
    });

    const password = $("#passwordInput");
    if (password) password.autocomplete = isRegister ? "new-password" : "current-password";
    const title = $("#authTitle");
    const hint = $("#authHint");
    const submit = $("#authSubmitText");
    if (title) title.textContent = isRegister ? "學生註冊" : "學生登入";
    if (hint) {
      hint.textContent = isRegister
        ? "第一次使用請建立學生帳號，安安會用這些資訊理解你的學院、系所與學習脈絡；之後請用同一個 email 登入。"
        : "請用註冊時的 email 與密碼登入。";
    }
    if (submit) submit.textContent = isRegister ? "完成註冊並和安安聊聊" : "登入並和安安聊聊";
  }

  function prepareChatSession() {
    state.sessionNumber = nextSessionNumber();
    state.messages = [];
    state.reportAnalysis = "";
    $("#chatLog").innerHTML = "";
    $("#chatInput").placeholder = `${state.profile.nickname}，輸入你想和安安說的話...`;
    updateExportState();
    showView("chatView");
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = normalizeEmail(form.get("email"));
    const password = String(form.get("password") || "");
    if (!email) {
      showToast("請先輸入 email。");
      $("#emailInput").focus();
      return;
    }
    if (password.length < 8) {
      showToast("密碼至少需要 8 個字元。");
      $("#passwordInput").focus();
      return;
    }

    if (state.authMode === "login") {
      const student = findStudent(email);
      if (!student) {
        showToast("這個 email 尚未註冊，請先建立學生帳號。");
        setAuthMode("register");
        return;
      }
      const passwordHash = await hashSecret(password, student.passwordSalt || "");
      if (passwordHash !== student.passwordHash) {
        showToast("密碼不正確，請再試一次。");
        $("#passwordInput").focus();
        return;
      }
      student.lastLoginAt = new Date().toISOString();
      saveStudents();
      setCurrentStudent(student);
      $("#passwordInput").value = "";
      prepareChatSession();
      showToast("已登入，可以開始和安安聊聊。");
      return;
    }

    const confirmPassword = String(form.get("confirmPassword") || "");
    if (password !== confirmPassword) {
      showToast("兩次輸入的密碼不一致。");
      $("#confirmPasswordInput").focus();
      return;
    }
    if (findStudent(email)) {
      showToast("這個 email 已註冊，請改用登入。");
      setAuthMode("login");
      return;
    }

    const passwordSalt = uid("salt");
    const student = {
      id: normalizedStudentId(form.get("studentId")) || uid("student"),
      nickname: safeText(form.get("nickname"), "同學"),
      email,
      studentId: normalizedStudentId(form.get("studentId")),
      grade: safeText(form.get("grade")),
      college: safeText(form.get("college")),
      department: safeText(form.get("department")),
      consent: form.get("recordConsent") === "on",
      passwordSalt,
      passwordHash: await hashSecret(password, passwordSalt),
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    state.students.push(student);
    saveStudents();
    setCurrentStudent(student);
    $("#passwordInput").value = "";
    $("#confirmPasswordInput").value = "";
    prepareChatSession();
    showToast("註冊完成，可以開始和安安聊聊。");
  }

  function addMessage(role, text, timestamp = new Date().toISOString(), meta = "") {
    const message = {
      role,
      text,
      timestamp: isoTime(timestamp),
      meta,
      sequence: state.messages.length + 1,
      inputMethod: role === "user" ? nextInputMethod : ""
    };
    state.messages.push(message);
    state.reportAnalysis = "";
    renderMessage(message);
    updateExportState();
    return message;
  }

  function renderMessage(message) {
    const node = document.createElement("article");
    node.className = `message ${message.role}`;
    const speaker = message.role === "user" ? (state.profile.nickname || "你") : "安安";
    const label = [formatMessageTime(message.timestamp), message.meta].filter(Boolean).join(" · ");
    node.innerHTML = `
      <strong>${escapeHtml(speaker)}</strong>
      <span>${escapeHtml(message.text).replace(/\n/g, "<br>")}</span>
      <time datetime="${escapeHtml(message.timestamp)}">${escapeHtml(label)}</time>
    `;
    $("#chatLog").appendChild(node);
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
    return node;
  }

  function renderConversation() {
    const log = $("#chatLog");
    log.innerHTML = "";
    state.messages.forEach((message) => renderMessage(message));
  }

  function updateMessageNode(node, text, timestamp = new Date().toISOString(), meta = "") {
    if (!node) return;
    node.classList.remove("pending");
    const time = isoTime(timestamp);
    const label = [formatMessageTime(time), meta].filter(Boolean).join(" · ");
    node.innerHTML = `
      <strong>安安</strong>
      <span>${escapeHtml(text).replace(/\n/g, "<br>")}</span>
      <time datetime="${escapeHtml(time)}">${escapeHtml(label)}</time>
    `;
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
  }

  async function handleChatSubmit(event) {
    event.preventDefault();
    const input = $("#chatInput");
    const text = safeText(input.value);
    if (!text) {
      input.focus();
      return;
    }
    if (!normalizeEmail(state.profile.email)) {
      showToast("請先用 email 登入或註冊。");
      returnToEntry();
      return;
    }
    if (hasReachedDailyLimit()) {
      showLimitDialog();
      return;
    }

    const submittedInputMethod = nextInputMethod;
    const userMessage = addMessage("user", text);
    input.value = "";
    input.dataset.inputMethod = "text";
    nextInputMethod = "text";

    const pending = renderPendingMessage();
    const reply = await resolveAgentReply(text, submittedInputMethod);
    if (reply.limitReached) {
      const index = state.messages.indexOf(userMessage);
      if (index >= 0) state.messages.splice(index, 1);
      if (pending && pending.parentNode) pending.parentNode.removeChild(pending);
      renderConversation();
      updateExportState();
      showLimitDialog();
      return;
    }
    const replyMessage = {
      role: "agent",
      text: reply.text,
      timestamp: new Date().toISOString(),
      meta: reply.source === "llm" ? "AI" : "",
      sequence: state.messages.length + 1
    };
    state.messages.push(replyMessage);
    if (reply.source === "llm") {
      const dailyTurnCount = Number(reply.dailyTurnCount || 0);
      if (dailyTurnCount > 0) setDailyTurnCount(dailyTurnCount);
      else incrementDailyTurnCount();
    }
    state.reportAnalysis = "";
    updateMessageNode(pending, replyMessage.text, replyMessage.timestamp, replyMessage.meta);
    updateExportState();
  }

  function renderPendingMessage() {
    const node = document.createElement("article");
    node.className = "message agent pending";
    node.innerHTML = `
      <strong>安安</strong>
      <span>思考中...</span>
      <time datetime="${escapeHtml(new Date().toISOString())}">${escapeHtml(formatMessageTime())}</time>
    `;
    $("#chatLog").appendChild(node);
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
    return node;
  }

  async function resolveAgentReply(text, inputMethod = "text") {
    if (!state.settings.gasEndpoint) {
      return { text: "目前沒有設定 GAS Web App URL，無法取得 AI 回覆。", source: "system" };
    }
    const history = state.messages
      .filter((message) => message.role === "user" || message.role === "agent")
      .slice(-10)
      .map((message) => ({
        role: message.role,
        text: message.text,
        timestamp: message.timestamp
      }));
    const payload = {
      message: text,
      context: state.profile,
      history,
      clientTime: new Date().toISOString(),
      inputMethod,
      sessionNumber: state.sessionNumber,
      dailyTurnLimit: DAILY_TURN_LIMIT,
      clientDailyTurnCount: getDailyTurnCount()
    };

    try {
      const data = await requestGas("llmChat", payload, LLM_TIMEOUT_MS);
      if (data && data.limitReached) return { limitReached: true };
      if (data && data.ok && safeText(data.reply)) {
        return { text: safeText(data.reply), source: "llm", dailyTurnCount: data.dailyTurnCount };
      }
      if (data && data.error) {
        if (data.error === "DAILY_LIMIT_REACHED" || data.error === LIMIT_DIALOG_TEXT) return { limitReached: true };
        return { text: `目前沒有收到 AI 回覆。GAS 回傳：${data.error}`, source: "system" };
      }
    } catch (err) {
      return { text: `目前沒有收到 AI 回覆。連線錯誤：${safeText(err.message, "瀏覽器未完成連線")}`, source: "system" };
    }
    return { text: "目前沒有收到 AI 回覆。", source: "system" };
  }

  async function requestGas(action, input, timeoutMs = 16000) {
    const endpoint = state.settings.gasEndpoint;
    const body = JSON.stringify({ action, input });
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body
      }, timeoutMs);
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseGasJson(text);
    } catch (fetchErr) {
      try {
        return await jsonp(action, { payload: JSON.stringify(input) }, timeoutMs);
      } catch (jsonpErr) {
        throw new Error(`fetch ${safeText(fetchErr.message, "failed")}；jsonp ${safeText(jsonpErr.message, "failed")}`);
      }
    }
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    if (!window.AbortController) return fetch(url, options);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(() => window.clearTimeout(timer));
  }

  function parseGasJson(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      const match = String(text || "").match(/^[^(]+\(([\s\S]*)\);?$/);
      if (match) return JSON.parse(match[1]);
      throw new Error("GAS 回傳格式無法解析");
    }
  }

  function jsonp(action, params, timeoutMs = 16000) {
    return new Promise((resolve, reject) => {
      const endpoint = state.settings.gasEndpoint;
      const callback = `__ndhuAnanCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const query = new URLSearchParams(Object.assign({}, params, { action, callback }));
      const script = document.createElement("script");
      const separator = endpoint.includes("?") ? "&" : "?";
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("timeout"));
      }, timeoutMs);

      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[callback]; } catch (err) { window[callback] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callback] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("load failed"));
      };
      script.src = `${endpoint}${separator}${query.toString()}`;
      document.head.appendChild(script);
    });
  }

  function conversationMessages() {
    return state.messages.filter((message) => message.role === "user" || message.role === "agent");
  }

  function hasConversation() {
    return conversationMessages().some((message) => message.role === "user");
  }

  function updateExportState() {
    const enabled = hasConversation();
    ["#downloadTxtButton", "#downloadPdfButton"].forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = !enabled;
    });
  }

  function clearConversation() {
    state.messages = [];
    state.reportAnalysis = "";
    $("#chatLog").innerHTML = "";
    updateExportState();
    $("#chatInput").focus();
  }

  function returnToEntry() {
    clearConversation();
    showView("entryView");
  }

  function fileSafeName(value) {
    return safeText(value, "student")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "")
      .slice(0, 32) || "student";
  }

  function reportTitle() {
    const count = state.sessionNumber || 1;
    return `第 ${count} 次對話紀錄`;
  }

  function reportDate() {
    return new Date().toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function reportMeta() {
    return {
      title: reportTitle(),
      date: reportDate(),
      name: state.profile.nickname || "未填寫",
      email: state.profile.email || "未填寫",
      studentId: state.profile.studentId || "未填寫",
      grade: state.profile.grade || "未填寫",
      college: state.profile.college || "未填寫",
      department: state.profile.department || "未填寫"
    };
  }

  function transcriptText() {
    return conversationMessages().map((message) => {
      const speaker = message.role === "user" ? (state.profile.nickname || "你") : "安安";
      const time = new Date(message.timestamp).toLocaleString("zh-TW");
      return `${message.sequence || ""}. [${time}] ${speaker}\n${message.text}`;
    }).join("\n\n");
  }

  function localReportAnalysis() {
    const userTexts = conversationMessages()
      .filter((message) => message.role === "user")
      .map((message) => message.text);
    const combined = userTexts.join("。");
    const topicHints = [];
    if (/成績|考|期中|期末|測驗|讀書|複習/.test(combined)) topicHints.push("成績與考試準備");
    if (/作業|報告|專題|繳交|拖|deadline/i.test(combined)) topicHints.push("作業進度與開始困難");
    if (/時間|打工|通勤|社團|排程|來不及/.test(combined)) topicHints.push("時間安排");
    if (/聽不懂|看不懂|概念|公式|統計|程式|英文|跨域/.test(combined)) topicHints.push("概念理解");
    if (/問老師|助教|不敢問|開口|討論/.test(combined)) topicHints.push("求助表達");
    const topics = topicHints.length ? topicHints.join("、") : "目前談到的學習卡點";
    const first = userTexts[0] || "你提到目前學習上有些卡住";
    const last = userTexts[userTexts.length - 1] || first;
    return [
      `${state.profile.nickname || "同學"}，這次對話中，你主要談到「${topics}」。從你一開始提到「${first}」，到後面補充「${last}」，可以看見你不是沒有在意學習，而是目前需要把事情縮小到更容易開始的一步。`,
      "安安在對話中陪你做的事，是先把壓力感接住，再把模糊的困難整理成可以描述、可以求助、可以安排的小行動。接下來最適合延續的方向，是先挑一門最急或最影響成績的課，用短時間完成一個很小的動作，再回頭看下一步。",
      "你可以把這份紀錄當成自己的學習整理單：不用一次解決全部，只要先找到一個能開始的位置。"
    ].join("\n\n");
  }

  async function reportAnalysis() {
    if (state.reportAnalysis) return state.reportAnalysis;
    const payload = {
      context: state.profile,
      messages: conversationMessages(),
      sessionNumber: state.sessionNumber,
      clientTime: new Date().toISOString()
    };
    try {
      const data = await requestGas("reportSummary", payload, LLM_TIMEOUT_MS);
      if (data && data.ok && safeText(data.summary)) {
        state.reportAnalysis = safeText(data.summary);
        return state.reportAnalysis;
      }
    } catch (err) {
      // The report still needs to work when the summary endpoint is unavailable.
    }
    state.reportAnalysis = localReportAnalysis();
    return state.reportAnalysis;
  }

  function triggerTextDownload(content, filename, type = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadTxtReport() {
    if (!hasConversation()) {
      showToast("目前還沒有可下載的對話。");
      return;
    }
    const meta = reportMeta();
    const analysis = await reportAnalysis();
    const content = [
      "LCEAS 國立東華大學學習關懷預警系統",
      meta.title,
      "",
      `日期：${meta.date}`,
      `姓名：${meta.name}`,
      `Email：${meta.email}`,
      `學號：${meta.studentId}`,
      `年級：${meta.grade}`,
      `學院：${meta.college}`,
      `科系：${meta.department}`,
      "",
      "綜合分析",
      analysis,
      "",
      "詳細對話過程",
      transcriptText()
    ].join("\n");
    triggerTextDownload(content, `LCEAS-${fileSafeName(meta.name)}-${fileSafeName(meta.studentId)}-${state.sessionNumber || 1}.txt`);
  }

  function paragraphHtml(text) {
    return escapeHtml(text)
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  function reportHtml(analysis) {
    const meta = reportMeta();
    const rows = conversationMessages().map((message) => {
      const speaker = message.role === "user" ? (state.profile.nickname || "你") : "安安";
      const time = new Date(message.timestamp).toLocaleString("zh-TW");
      return `
        <article class="report-turn ${message.role}">
          <div class="report-turn-meta">${escapeHtml(String(message.sequence || ""))}｜${escapeHtml(time)}｜${escapeHtml(speaker)}</div>
          <div class="report-turn-text">${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>
        </article>
      `;
    }).join("");
    return `
      <div class="report-document">
        <section class="report-page report-cover">
          <img class="report-cover-photo" src="assets/img/ndhu-campus-lake.jpg" alt="國立東華大學校園湖畔">
          <div class="report-cover-content">
            <div class="report-emblem">LCEAS</div>
            <h1>國立東華大學學習關懷預警系統</h1>
            <h2>${escapeHtml(meta.title)}</h2>
            <dl>
              <div><dt>日期</dt><dd>${escapeHtml(meta.date)}</dd></div>
              <div><dt>姓名</dt><dd>${escapeHtml(meta.name)}</dd></div>
              <div><dt>Email</dt><dd>${escapeHtml(meta.email)}</dd></div>
              <div><dt>學號</dt><dd>${escapeHtml(meta.studentId)}</dd></div>
              <div><dt>年級</dt><dd>${escapeHtml(meta.grade)}</dd></div>
              <div><dt>學院</dt><dd>${escapeHtml(meta.college)}</dd></div>
              <div><dt>科系</dt><dd>${escapeHtml(meta.department)}</dd></div>
            </dl>
          </div>
        </section>
        <section class="report-page report-analysis-page">
          <div class="report-section-label">Learning Care Summary</div>
          <h2>綜合分析</h2>
          <div class="report-analysis">${paragraphHtml(analysis)}</div>
        </section>
        <section class="report-page report-dialogue">
          <div class="report-section-label">Conversation Transcript</div>
          <h2>詳細對話過程</h2>
          ${rows}
        </section>
      </div>
    `;
  }

  function openPrintableReport(html) {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      showToast("瀏覽器阻擋了 PDF 視窗，請允許彈出視窗後再試。");
      return;
    }
    win.document.write(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>LCEAS PDF</title><link rel="stylesheet" href="assets/css/styles.css"></head><body>${html}<script>window.onload=()=>window.print();</script></body></html>`);
    win.document.close();
  }

  function addPdfPageNumbers(pdf) {
    if (!pdf || !pdf.internal) return;
    const totalPages = pdf.internal.getNumberOfPages();
    const pageSize = pdf.internal.pageSize;
    const width = typeof pageSize.getWidth === "function" ? pageSize.getWidth() : pageSize.width;
    const height = typeof pageSize.getHeight === "function" ? pageSize.getHeight() : pageSize.height;
    for (let page = 3; page <= totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(10);
      pdf.setTextColor(99, 118, 115);
      pdf.text(String(page - 2), width / 2, height - 28, { align: "center" });
    }
  }

  async function downloadPdfReport() {
    if (!hasConversation()) {
      showToast("目前還沒有可下載的對話。");
      return;
    }
    const button = $("#downloadPdfButton");
    if (button) button.disabled = true;
    showToast("正在整理 PDF。");
    const meta = reportMeta();
    const analysis = await reportAnalysis();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = reportHtml(analysis);
    const report = wrapper.firstElementChild;
    report.classList.add("report-rendering");
    document.body.appendChild(report);

    try {
      if (!window.html2pdf) {
        openPrintableReport(report.outerHTML);
        return;
      }
      const worker = window.html2pdf()
        .set({
          margin: [48, 0, 48, 0],
          filename: `LCEAS-${fileSafeName(meta.name)}-${fileSafeName(meta.studentId)}-${state.sessionNumber || 1}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: [".report-turn"] }
        })
        .from(report)
        .toPdf();
      await worker.get("pdf").then(addPdfPageNumbers);
      await worker.save();
    } finally {
      report.remove();
      updateExportState();
    }
  }

  function setupVoiceInput() {
    const button = $("#voiceInputButton");
    const input = $("#chatInput");
    if (!button || !input) return;

    input.addEventListener("input", () => {
      if (!isListening) {
        input.dataset.inputMethod = "text";
        nextInputMethod = "text";
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      $("#chatForm").requestSubmit();
    });

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      button.addEventListener("click", () => showToast("這個瀏覽器目前不支援語音輸入。"));
      return;
    }

    speechRecognition = new Recognition();
    speechRecognition.lang = "zh-TW";
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;
    let baseText = "";

    speechRecognition.addEventListener("start", () => {
      isListening = true;
      baseText = input.value.trim();
      button.classList.add("listening");
      button.setAttribute("aria-label", "停止語音輸入");
      button.setAttribute("title", "停止語音輸入");
      button.innerHTML = `<i data-lucide="mic-off"></i>`;
      iconRefresh();
    });

    speechRecognition.addEventListener("result", (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript.trim();
        if (event.results[index].isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      const heard = finalTranscript || interimTranscript;
      if (!heard) return;
      input.value = [baseText, heard].filter(Boolean).join(baseText ? " " : "");
      if (finalTranscript) baseText = input.value.trim();
      input.dataset.inputMethod = "voice";
      nextInputMethod = "voice";
    });

    speechRecognition.addEventListener("error", (event) => {
      if (event.error !== "no-speech") showToast("語音輸入暫時無法使用。");
    });

    speechRecognition.addEventListener("end", () => {
      isListening = false;
      button.classList.remove("listening");
      button.setAttribute("aria-label", "語音輸入");
      button.setAttribute("title", "語音輸入");
      button.innerHTML = `<i data-lucide="mic"></i>`;
      iconRefresh();
    });

    button.addEventListener("click", () => {
      if (isListening) {
        speechRecognition.stop();
        return;
      }
      try {
        speechRecognition.start();
      } catch (err) {
        showToast("語音輸入正在準備中。");
      }
    });
  }

  function bindEvents() {
    const brand = $(".brand");
    if (brand) brand.addEventListener("click", (event) => event.preventDefault());
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });
    $("#authForm").addEventListener("submit", handleAuthSubmit);
    $("#chatForm").addEventListener("submit", handleChatSubmit);
    $("#backToEntryButton").addEventListener("click", returnToEntry);
    $("#clearChatButton").addEventListener("click", clearConversation);
    $("#downloadTxtButton").addEventListener("click", downloadTxtReport);
    $("#downloadPdfButton").addEventListener("click", downloadPdfReport);
  }

  function init() {
    loadSettings();
    loadAuthState();
    populateProfileOptions();
    bindEvents();
    setAuthMode("register");
    setupUsageConsent();
    setupVoiceInput();
    updateExportState();
    iconRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
