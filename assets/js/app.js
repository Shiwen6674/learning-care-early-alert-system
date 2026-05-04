(function () {
  "use strict";

  const STORE_KEY = "ndhu.learning.warning.state.v1";
  const SESSION_KEY = "ndhu.learning.warning.currentUser";
  const SETTINGS_KEY = "ndhu.learning.warning.settings";
  const CONSENT_KEY = "ndhu.learning.warning.usageConsent.v1";
  const DEFAULT_CONFIG = {
    gasEndpoint: "",
    teacherToken: ""
  };

  const quickNeeds = [
    "期中快到了，我不知道先讀哪裡",
    "作業一直拖，打開就想逃避",
    "我有缺課，現在跟不上進度",
    "想問老師，但不知道怎麼開口",
    "跨域修課，先備知識有落差",
    "讀很多次，還是抓不到重點",
    "通勤、打工或社團把時間切碎了",
    "我需要東東陪我排下一步"
  ];

  const supportOptions = [
    "請東東陪我排讀書計畫",
    "幫我整理給老師的提問",
    "預約導師晤談",
    "找助教或同學討論",
    "調整作業與考試策略",
    "連結東華學習資源或系所支持"
  ];

  const urgentWords = ["自傷", "自殺", "不想活", "傷害自己", "傷害別人", "活不下去", "結束生命"];
  const pressureWords = ["崩潰", "焦慮", "害怕", "睡不著", "壓力", "來不及", "放棄", "缺課", "退選", "被當", "期中", "期末", "考試", "作業"];

  const state = {
    users: [],
    checkins: [],
    conversations: [],
    riskSignals: [],
    teacherNotes: [],
    currentUser: null,
    settings: Object.assign({}, DEFAULT_CONFIG)
  };
  let authMode = "login";
  let speechRecognition = null;
  let isListening = false;
  let nextInputMethod = "text";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

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

  function publicUser(user) {
    const copy = Object.assign({}, user || {});
    delete copy.passwordHash;
    delete copy.passwordSalt;
    delete copy.resetCodeHash;
    delete copy.resetSalt;
    delete copy.resetExpiresAt;
    return copy;
  }

  function findUser(role, email) {
    const normalized = normalizeEmail(email);
    return state.users.find((entry) => entry.role === role && normalizeEmail(entry.email) === normalized);
  }

  function isAuthenticatedCurrentUser(role) {
    if (!state.currentUser || state.currentUser.role !== role || !state.currentUser.email) return false;
    const storedUser = findUser(role, state.currentUser.email);
    return Boolean(storedUser && storedUser.passwordHash);
  }

  function makeResetCode() {
    const values = new Uint32Array(1);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(values);
    const number = values[0] || Math.floor(Math.random() * 900000);
    return String(100000 + (number % 900000));
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

  async function hashSecret(secret, salt) {
    return digestText(`${salt}:${secret}`);
  }

  function uid(prefix) {
    const random = window.crypto && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint16Array(2))).map((n) => n.toString(36)).join("")
      : Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
  }

  function todayPlus(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
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

  function isoTime(value) {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      Object.assign(state, {
        users: Array.isArray(stored.users) ? stored.users : [],
        checkins: Array.isArray(stored.checkins) ? stored.checkins : [],
        conversations: Array.isArray(stored.conversations) ? stored.conversations : [],
        riskSignals: Array.isArray(stored.riskSignals) ? stored.riskSignals : [],
        teacherNotes: Array.isArray(stored.teacherNotes) ? stored.teacherNotes : []
      });
    } catch (err) {
      console.warn("Unable to load local state", err);
    }

    try {
      state.settings = Object.assign({}, DEFAULT_CONFIG, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
    } catch (err) {
      state.settings = Object.assign({}, DEFAULT_CONFIG);
    }

    try {
      state.currentUser = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (err) {
      state.currentUser = null;
    }
  }

  function saveState() {
    const snapshot = {
      users: state.users,
      checkins: state.checkins,
      conversations: state.conversations,
      riskSignals: state.riskSignals,
      teacherNotes: state.teacherNotes
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function setCurrentUser(user) {
    state.currentUser = user;
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_KEY);
    $("#logoutButton").classList.toggle("hidden", !user);
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    $("#toastRegion").appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }

  function clearAuthSecrets() {
    ["password", "confirmPassword"].forEach((name) => {
      const input = $(`[name='${name}']`);
      if (input) input.value = "";
    });
    ["resetCodeInput", "resetPasswordInput"].forEach((id) => {
      const input = $(`#${id}`);
      if (input) input.value = "";
    });
  }

  function iconRefresh() {
    if (window.lucide) window.lucide.createIcons();
  }

  function populateCollegeSelects() {
    const collegeSelect = $("#collegeSelect");
    const departmentSelect = $("#departmentSelect");
    const colleges = (window.NDHULearningData && window.NDHULearningData.colleges) || [];
    collegeSelect.innerHTML = colleges.map((college) => `<option value="${escapeHtml(college.name)}">${escapeHtml(college.name)}</option>`).join("");

    function updateDepartments() {
      const selected = colleges.find((college) => college.name === collegeSelect.value) || colleges[0];
      departmentSelect.innerHTML = (selected ? selected.departments : [])
        .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
        .join("");
    }

    collegeSelect.addEventListener("change", updateDepartments);
    updateDepartments();
  }

  function renderLandingNeeds() {
    const landing = $("#landingQuickNeeds");
    const studentNeeds = $("#studentNeedButtons");
    if (landing) landing.innerHTML = "";
    studentNeeds.innerHTML = "";

    quickNeeds.forEach((need) => {
      if (landing) {
        const landingButton = document.createElement("button");
        landingButton.type = "button";
        landingButton.className = "need-chip";
        landingButton.textContent = need;
        landingButton.addEventListener("click", () => {
          ensureStudentSession();
          showView("student");
          $("#chatInput").value = need;
          $("#chatInput").focus();
        });
        landing.appendChild(landingButton);
      }

      const studentButton = document.createElement("button");
      studentButton.type = "button";
      studentButton.className = "need-chip";
      studentButton.textContent = need;
      studentButton.addEventListener("click", () => {
        $("#chatInput").value = need;
        $("#chatInput").focus();
      });
      studentNeeds.appendChild(studentButton);
    });
  }

  function renderStudentSelects() {
    const tags = (window.NDHULearningData && window.NDHULearningData.difficultyTags) || [];
    $("#difficultyType").innerHTML = tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("");
    $("#preferredSupport").innerHTML = supportOptions.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("");
    $("#followUpDate").value = todayPlus(7);
  }

  function bindAuthRoleTabs() {
    $$("[data-auth-role]").forEach((button) => {
      button.addEventListener("click", () => setAuthRole(button.dataset.authRole));
    });
  }

  function bindAuthModeTabs() {
    $$("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });
    const switchButton = $("#authSwitchButton");
    if (switchButton) {
      switchButton.addEventListener("click", () => setAuthMode(getAuthMode() === "login" ? "register" : "login"));
    }
  }

  function setAuthRole(role) {
    $$("[data-auth-role]").forEach((button) => {
      const active = button.dataset.authRole === role;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    syncAuthFormState();
  }

  function setAuthMode(mode) {
    authMode = mode === "login" ? "login" : "register";
    $$("[data-auth-mode]").forEach((button) => {
      const active = button.dataset.authMode === authMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    if ($("#authSwitchText") && $("#authSwitchButton")) {
      $("#authSwitchText").textContent = authMode === "login" ? "尚未註冊？" : "已有帳號？";
      $("#authSwitchButton").textContent = authMode === "login" ? "建立帳號" : "回到登入";
    }
    syncAuthFormState();
  }

  function getAuthRole() {
    const active = $("[data-auth-role].active");
    return active ? active.dataset.authRole : "student";
  }

  function getAuthMode() {
    return authMode;
  }

  function syncAuthFormState() {
    const role = getAuthRole();
    const isRegister = getAuthMode() === "register";
    const registerNodes = $$("[data-register-only]");
    const studentNodes = $$("[data-student-only]");
    const teacherNodes = $$("[data-teacher-only]");

    function setNodeState(node, visible) {
      node.classList.toggle("hidden", !visible);
      $$("input, select, textarea", node).forEach((control) => {
        if (control.dataset.wasRequired === undefined) control.dataset.wasRequired = control.required ? "true" : "false";
        control.disabled = !visible;
        control.required = visible && control.dataset.wasRequired === "true";
      });
    }

    registerNodes.forEach((node) => setNodeState(node, isRegister));
    studentNodes.forEach((node) => setNodeState(node, isRegister && role === "student"));
    teacherNodes.forEach((node) => setNodeState(node, isRegister && role === "teacher"));
    $("#loginAssist").classList.toggle("hidden", isRegister);
    $("#resetPanel").classList.toggle("hidden", isRegister || !$("#resetPanel").dataset.open);

    const passwordInput = $("[name='password']");
    passwordInput.autocomplete = isRegister ? "new-password" : "current-password";
    $("#authTitle").textContent = role === "student"
      ? (isRegister ? "學生註冊" : "學生登入")
      : (isRegister ? "教師註冊" : "教師登入");
    $("#authHint").textContent = role === "student"
      ? (isRegister
        ? "第一次使用請建立帳號，東東會用學院、系所與年級理解你的學習脈絡。"
        : "請先登入，東東會接續你的學習脈絡，陪你把最近的卡點整理清楚。")
      : (isRegister
        ? "教師第一次使用請建立帳號，之後可進入教師工作台查看學生學習摘要與追蹤事項。"
        : "請登入教師帳號，進入教師工作台查看已授權的學生學習紀錄。");
    $("#authSubmitText").textContent = role === "student"
      ? (isRegister ? "完成註冊並找東東" : "登入")
      : (isRegister ? "完成教師註冊" : "登入教師工作台");
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const role = getAuthRole();
    const mode = getAuthMode();
    const form = new FormData(event.currentTarget);
    const email = normalizeEmail(form.get("email"));
    const password = String(form.get("password") || "");

    if (!email) {
      showToast("請先輸入信箱。");
      return;
    }
    if (password.length < 8) {
      showToast("密碼至少需要 8 個字元。");
      return;
    }

    if (mode === "login") {
      const storedUser = findUser(role, email);
      if (!storedUser) {
        showToast("這個信箱尚未註冊，請先建立帳號。");
        setAuthMode("register");
        return;
      }
      if (!storedUser.passwordHash || !storedUser.passwordSalt) {
        showToast("這個帳號尚未設定密碼，請使用忘記密碼建立新密碼。");
        return;
      }
      const passwordHash = await hashSecret(password, storedUser.passwordSalt);
      if (passwordHash !== storedUser.passwordHash) {
        showToast("密碼不正確，請再試一次，或使用忘記密碼。");
        return;
      }
      storedUser.lastLoginAt = new Date().toISOString();
      upsertUser(storedUser);
      setCurrentUser(publicUser(storedUser));
      saveState();
      clearAuthSecrets();
      syncWrite("login", { user: publicUser(storedUser) });
      if (role === "student") {
        showView("student");
        showToast("已登入，東東會接續陪你整理學習近況。");
      } else {
        showView("teacher");
        showToast("已登入教師工作台。");
      }
      return;
    }

    if (password !== String(form.get("confirmPassword") || "")) {
      showToast("兩次輸入的密碼不一致。");
      return;
    }

    const existing = findUser(role, email);
    if (existing && existing.passwordHash) {
      showToast("這個信箱已註冊，請改用登入。");
      setAuthMode("login");
      return;
    }

    const passwordSalt = uid("salt");
    const passwordHash = await hashSecret(password, passwordSalt);
    const user = Object.assign({}, existing || {}, {
      id: role === "student" ? safeText(form.get("studentId"), existing ? existing.id : uid("student")) : safeText(form.get("teacherId"), existing ? existing.id : uid("teacher")),
      role,
      name: safeText(form.get("name"), role === "student" ? "東華同學" : "東華教師"),
      email,
      college: safeText(form.get("college")),
      department: safeText(form.get("department")),
      year: safeText(form.get("year")),
      teacherToken: safeText(form.get("teacherToken")) || state.settings.teacherToken,
      consent: localStorage.getItem(CONSENT_KEY) === "accepted",
      passwordSalt,
      passwordHash,
      resetCodeHash: "",
      resetSalt: "",
      resetExpiresAt: "",
      updatedAt: new Date().toISOString()
    });

    upsertUser(user);
    if (user.teacherToken) {
      state.settings.teacherToken = user.teacherToken;
      saveSettings();
    }
    setCurrentUser(publicUser(user));
    saveState();
    clearAuthSecrets();
    syncWrite("register", { user: publicUser(user) });
    if (role === "student") {
      showView("student");
      showToast("註冊完成，東東在這裡陪你整理下一步。");
    } else {
      showView("teacher");
      showToast("教師帳號已建立，已進入工作台。");
    }
  }

  async function requestPasswordReset() {
    const role = getAuthRole();
    const email = normalizeEmail($("[name='email']").value);
    if (!email) {
      showToast("請先輸入註冊信箱。");
      $("[name='email']").focus();
      return;
    }
    const user = findUser(role, email);
    if (!user) {
      showToast("查無此信箱，請先確認角色與信箱，或改用註冊。");
      return;
    }
    const code = makeResetCode();
    const salt = uid("reset");
    user.resetSalt = salt;
    user.resetCodeHash = await hashSecret(code, salt);
    user.resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    upsertUser(user);
    saveState();
    syncWrite("requestPasswordReset", {
      user: publicUser(user),
      resetCode: code,
      resetExpiresAt: user.resetExpiresAt
    });
    $("#resetPanel").dataset.open = "true";
    $("#resetPanel").classList.remove("hidden");
    $("#resetHint").textContent = state.settings.gasEndpoint
      ? `修改認證已寄到 ${email}，請在 15 分鐘內輸入認證碼與新密碼。`
      : `修改認證已建立。本機模式認證碼：${code}。正式上線時可在連線設定接上 GAS，讓認證碼寄到信箱。`;
    $("#resetCodeInput").focus();
    iconRefresh();
  }

  async function applyPasswordReset() {
    const role = getAuthRole();
    const email = normalizeEmail($("[name='email']").value);
    const code = safeText($("#resetCodeInput").value);
    const password = String($("#resetPasswordInput").value || "");
    const user = findUser(role, email);
    if (!user || !user.resetCodeHash || !user.resetSalt) {
      showToast("請先寄送修改認證。");
      return;
    }
    if (new Date(user.resetExpiresAt).getTime() < Date.now()) {
      showToast("認證碼已逾時，請重新寄送。");
      return;
    }
    if (password.length < 8) {
      showToast("新密碼至少需要 8 個字元。");
      return;
    }
    const codeHash = await hashSecret(code, user.resetSalt);
    if (codeHash !== user.resetCodeHash) {
      showToast("認證碼不正確，請確認信件內容。");
      return;
    }
    user.passwordSalt = uid("salt");
    user.passwordHash = await hashSecret(password, user.passwordSalt);
    user.resetCodeHash = "";
    user.resetSalt = "";
    user.resetExpiresAt = "";
    user.updatedAt = new Date().toISOString();
    upsertUser(user);
    saveState();
    syncWrite("passwordReset", { user: publicUser(user) });
    $("#resetPanel").dataset.open = "";
    $("#resetPanel").classList.add("hidden");
    $("#resetCodeInput").value = "";
    $("#resetPasswordInput").value = "";
    setAuthMode("login");
    showToast("密碼已更新，請用新密碼登入。");
  }

  function upsertUser(user) {
    const key = `${user.role}:${user.email || user.id}`;
    const index = state.users.findIndex((entry) => `${entry.role}:${entry.email || entry.id}` === key);
    if (index >= 0) state.users[index] = Object.assign({}, state.users[index], user);
    else state.users.push(user);
  }

  function showLoginRequired(role = "student") {
    showView("entry");
    setAuthRole(role);
    setAuthMode("login");
    const emailInput = $("[name='email']");
    if (emailInput) emailInput.focus();
    showToast(role === "student"
      ? "請先登入或建立帳號，東東才能接續你的學習脈絡。"
      : "請先登入教師帳號。");
  }

  function ensureStudentSession() {
    if (isAuthenticatedCurrentUser("student")) return state.currentUser;
    showLoginRequired("student");
    return null;
  }

  function showView(view) {
    if (view === "student" && !isAuthenticatedCurrentUser("student")) {
      showLoginRequired("student");
      return;
    }
    if (view === "teacher" && !isAuthenticatedCurrentUser("teacher")) {
      showLoginRequired("teacher");
      return;
    }
    $("#entryView").classList.toggle("hidden", view !== "entry");
    $("#studentView").classList.toggle("hidden", view !== "student");
    $("#teacherView").classList.toggle("hidden", view !== "teacher");
    if (view === "student") {
      renderStudentProfile();
      ensureChatIntro();
    }
    if (view === "teacher") renderTeacherDashboard();
    iconRefresh();
  }

  function renderStudentProfile() {
    const user = ensureStudentSession();
    if (!user) return;
    $("#studentAvatar").textContent = safeText(user.name, "學").slice(0, 1);
    $("#studentName").textContent = safeText(user.name, "東華同學");
    $("#studentMeta").textContent = [user.college, user.department, user.year].filter(Boolean).join(" · ") || "東華大學";
    const latest = getLatestCheckin(user.id);
    updateStudentRisk(latest ? latest.analysis : null);
    renderStudentRecommendation(latest ? latest.analysis : null);
  }

  function getLatestCheckin(studentId) {
    return state.checkins
      .filter((entry) => entry.studentId === studentId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  }

  function ensureChatIntro() {
    if ($("#chatLog").children.length) return;
    const user = ensureStudentSession();
    if (!user) return;
    const history = state.conversations
      .filter((entry) => entry.studentId === user.id)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(-20);
    history.forEach((entry) => {
      addChatMessage("user", entry.text, entry.createdAt, entry.inputMethod === "voice" ? "語音轉文字" : "");
      addChatMessage("agent", entry.agentReply, entry.replyAt || entry.createdAt);
    });
    if (history.length) return;
    addChatMessage("agent", "我是東東，東華的學習陪伴窗口。你不用把事情講得很完整，先丟一句很亂的也可以，我會陪你慢慢整理。");
    addChatMessage("agent", "你可以從「哪門課、哪個作業、哪次考試、哪個生活節奏卡住」任選一個開始。東東會接話，不會把你丟在半路。");
  }

  function addChatMessage(role, text, timestamp = new Date().toISOString(), meta = "") {
    const message = document.createElement("div");
    message.className = `message ${role === "user" ? "user" : "agent"}`;
    const speaker = role === "user" ? "你" : "東東";
    const time = isoTime(timestamp);
    const label = [formatMessageTime(time), meta].filter(Boolean).join(" · ");
    message.innerHTML = `
      <strong>${speaker}</strong>
      <span>${escapeHtml(text).replace(/\n/g, "<br>")}</span>
      <time datetime="${escapeHtml(time)}">${escapeHtml(label)}</time>
    `;
    $("#chatLog").appendChild(message);
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
  }

  function handleChatSubmit(event) {
    event.preventDefault();
    const input = $("#chatInput");
    const text = input.value.trim();
    if (!text) return;
    const user = ensureStudentSession();
    if (!user) return;
    const inputMethod = input.dataset.inputMethod || nextInputMethod || "text";
    const createdAt = new Date().toISOString();
    addChatMessage("user", text, createdAt, inputMethod === "voice" ? "語音轉文字" : "");
    input.value = "";
    input.dataset.inputMethod = "";
    nextInputMethod = "text";

    const context = readCheckinContext();
    const analysis = analyzeLearningNeed(Object.assign({}, context, { text }));
    const response = buildAgentResponse(analysis);
    const replyAt = new Date().toISOString();
    addChatMessage("agent", response, replyAt);
    updateStudentRisk(analysis);
    renderStudentRecommendation(analysis);

    const conversation = {
      conversationId: uid("conv"),
      createdAt,
      replyAt,
      studentId: user.id,
      studentName: user.name,
      college: user.college,
      department: user.department,
      text,
      agentReply: response,
      inputMethod,
      analysis
    };
    state.conversations.push(conversation);
    if (analysis.score >= 55) {
      state.riskSignals.push(toRiskSignal(user, analysis, "conversation"));
    }
    saveState();
    syncWrite("submitConversation", { conversation });
  }

  function readCheckinContext() {
    return {
      courseName: safeText($("#courseName").value),
      difficultyType: safeText($("#difficultyType").value),
      difficultyScore: Number($("#difficultyScore").value || 3),
      attendanceStatus: safeText($("#attendanceStatus").value),
      preferredSupport: safeText($("#preferredSupport").value),
      followUpDate: safeText($("#followUpDate").value)
    };
  }

  function analyzeLearningNeed(context) {
    const text = safeText(context.text);
    const combined = `${text} ${context.courseName || ""} ${context.difficultyType || ""} ${context.attendanceStatus || ""}`;
    const tags = new Set();
    const reasons = [];
    let score = Math.max(0, Math.min(50, Number(context.difficultyScore || 3) * 10));

    if (context.difficultyType) tags.add(context.difficultyType);
    if (/作業|報告|繳交|期限|deadline/i.test(combined)) tags.add("作業進度");
    if (/考|期中|期末|測驗|成績/i.test(combined)) tags.add("考試焦慮");
    if (/聽不懂|不懂|公式|概念|理論|讀不懂/i.test(combined)) tags.add("概念理解");
    if (/時間|打工|社團|家務|排|來不及/i.test(combined)) tags.add("時間管理");
    if (/跨域|轉系|雙主修|先備|基礎/i.test(combined)) tags.add("先備知識");
    if (/英文|語言|閱讀|文本|看不懂/i.test(combined)) tags.add("語言或閱讀");
    if (/缺課|翹課|沒去|遲交|中斷/i.test(combined)) tags.add("出缺席");

    pressureWords.forEach((word) => {
      if (combined.includes(word)) score += 4;
    });

    if (context.attendanceStatus === "近期缺課或遲交") {
      score += 16;
      reasons.push("近期出席或繳交狀態需要追蹤");
    } else if (context.attendanceStatus === "已經中斷一段時間") {
      score += 28;
      reasons.push("學習參與已經中斷，需要盡快有人接住");
    } else if (context.attendanceStatus === "偶爾跟不上") {
      score += 8;
      reasons.push("課程節奏已有落差");
    }

    urgentWords.forEach((word) => {
      if (combined.includes(word)) {
        score = Math.max(score, 92);
        tags.add("立即安全");
        reasons.push("出現立即安全訊號，需要先聯絡緊急或校內支持資源");
      }
    });

    if (!reasons.length) {
      if (score >= 60) reasons.push("困難程度偏高，建議一週內追蹤");
      else reasons.push("目前可先用具體步驟整理學習問題");
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const level = riskLevel(score);
    const recommendations = buildRecommendations(level, Array.from(tags), context);
    return {
      score,
      level,
      tags: Array.from(tags).slice(0, 5),
      reasons,
      recommendations,
      followUpQuestion: buildFollowUpQuestion(level, Array.from(tags), context),
      summary: summarizeNeed(context, Array.from(tags), level)
    };
  }

  function riskLevel(score) {
    if (score >= 82) return "立即轉介";
    if (score >= 60) return "優先關懷";
    if (score >= 35) return "觀察";
    return "穩定";
  }

  function riskClass(level) {
    return {
      "穩定": "risk-stable",
      "觀察": "risk-watch",
      "優先關懷": "risk-priority",
      "立即轉介": "risk-urgent"
    }[level] || "risk-stable";
  }

  function buildRecommendations(level, tags, context) {
    if (level === "立即轉介") {
      return [
        "先確保安全：請立刻聯絡 119、110、校安中心、校內諮商資源，或請身邊可信任的人陪你。",
        "今天不要獨自承受這件事，先讓一位教師、導師、室友、家人或同學知道你需要協助。",
        "課業可以晚一點再整理，現在最重要的是安全與有人陪你。"
      ];
    }

    const course = context.courseName ? `「${context.courseName}」` : "這門課";
    const steps = [];
    if (tags.includes("概念理解") || tags.includes("先備知識")) {
      steps.push(`把 ${course} 最不懂的三個概念寫成問題，東東可以幫你改成問老師或助教的句子。`);
    }
    if (tags.includes("作業進度")) {
      steps.push("把作業切成「已懂、卡住、需要求助」三欄，先保住能拿分的部分。");
    }
    if (tags.includes("考試焦慮")) {
      steps.push("先排出兩個 40 分鐘複習時段，只處理最常出題或最能補分的單元。");
    }
    if (tags.includes("時間管理")) {
      steps.push("把接下來七天的固定行程列出來，先找出兩段可以穩定學習的時間。");
    }
    if (tags.includes("出缺席")) {
      steps.push("今天先讓導師或授課教師知道你已經卡住，東東可以陪你整理一段不尷尬的開場。");
    }
    if (!steps.length) {
      steps.push("先寫下目前卡住的一句話，再補上你已經試過的方法。");
      steps.push("選一位可以求助的人，今天先傳一則很短的訊息。");
    }
    if (level === "優先關懷") {
      steps.unshift("建議在三天內安排一次導師或授課教師晤談，先不用等到完全崩住才開口。");
    } else if (level === "觀察") {
      steps.unshift("建議一週內回來更新一次近況，確認方法是否有效。");
    }
    return steps.slice(0, 3);
  }

  function buildFollowUpQuestion(level, tags, context) {
    if (level === "立即轉介") {
      return "你現在身邊有沒有一個可以立刻陪你的人？可以只回「有」或「沒有」。";
    }
    if (tags.includes("作業進度")) {
      return "這份作業現在最卡的是看不懂題目、找不到方法，還是時間不夠？";
    }
    if (tags.includes("考試焦慮")) {
      return "如果只先救一個單元，你覺得最該先救哪一章？";
    }
    if (tags.includes("出缺席")) {
      return "缺掉的課裡，你最想先補哪一次或哪個主題？";
    }
    if (tags.includes("時間管理")) {
      return "你這週哪兩段時間比較可能安靜讀 30 分鐘？";
    }
    if (tags.includes("概念理解") || tags.includes("先備知識")) {
      return "你可以丟一個最不懂的名詞或題目給東東，我們先拆第一步。";
    }
    return context.courseName
      ? `關於「${context.courseName}」，你想先處理作業、考試、上課聽不懂，還是問老師這件事？`
      : "你想先跟東東說哪一門課，或哪件最近最煩的學習任務？";
  }

  function summarizeNeed(context, tags, level) {
    const course = safeText(context.courseName, "尚未指定課程");
    const issue = tags.length ? tags.join("、") : safeText(context.difficultyType, "學習困難");
    return `${course} 目前主要需要處理：${issue}。關懷層級為 ${level}。`;
  }

  function buildAgentResponse(analysis) {
    const intro = analysis.level === "立即轉介"
      ? "我先把最重要的事放前面：你的安全比課業更優先。"
      : "我有聽到，你現在不是沒有努力，而是事情已經卡成一團，需要有人陪你拆小。";
    const reason = analysis.reasons.length ? `東東先抓到的重點是：${analysis.reasons.join("；")}。` : "";
    const steps = analysis.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n");
    return `${intro}\n${reason}\n我們先不要一次解全部，先做這幾步就好：\n${steps}\n\n我想接著問你一個小問題：${analysis.followUpQuestion}`;
  }

  function updateStudentRisk(analysis) {
    const effective = analysis || { level: "穩定", score: 12, reasons: ["先跟東東說一件最近卡住的事，東東會陪你整理重點。"] };
    $("#studentRiskLabel").textContent = effective.level;
    $("#studentRiskMeter").value = effective.score;
    $("#studentRiskReason").textContent = effective.reasons.join("；");
  }

  function renderStudentRecommendation(analysis) {
    const box = $("#studentRecommendation");
    if (!analysis) {
      box.innerHTML = "跟東東聊一句，或填一下右邊近況，這裡就會整理你可以先做的小步驟。";
      return;
    }
    box.innerHTML = `
      <strong>${escapeHtml(analysis.summary)}</strong>
      <ul>${analysis.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <p class="follow-up-line">東東接著想問：${escapeHtml(analysis.followUpQuestion || "你想先處理哪一件事？")}</p>
    `;
  }

  function handleSaveCheckin() {
    const user = ensureStudentSession();
    if (!user) return;
    const context = readCheckinContext();
    const latestConversation = state.conversations
      .filter((entry) => entry.studentId === user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    const analysis = analyzeLearningNeed(Object.assign({}, context, { text: latestConversation ? latestConversation.text : "" }));
    const checkin = {
      checkinId: uid("checkin"),
      createdAt: new Date().toISOString(),
      studentId: user.id,
      studentName: user.name,
      email: user.email,
      college: user.college,
      department: user.department,
      year: user.year,
      courseName: context.courseName,
      difficultyType: context.difficultyType,
      difficultyScore: context.difficultyScore,
      attendanceStatus: context.attendanceStatus,
      preferredSupport: context.preferredSupport,
      followUpDate: context.followUpDate || todayPlus(7),
      analysis
    };
    state.checkins.push(checkin);
    if (analysis.score >= 35) state.riskSignals.push(toRiskSignal(user, analysis, "checkin"));
    saveState();
    updateStudentRisk(analysis);
    renderStudentRecommendation(analysis);
    syncWrite("submitCheckin", { checkin });
    showToast("已保存，東東也把重點整理成教師看得懂的學習摘要。");
  }

  function toRiskSignal(user, analysis, source) {
    return {
      signalId: uid("risk"),
      createdAt: new Date().toISOString(),
      studentId: user.id,
      studentName: user.name,
      source,
      category: analysis.tags.join("、"),
      severity: analysis.level,
      evidence: analysis.summary,
      riskScore: analysis.score,
      status: analysis.level === "立即轉介" ? "需要立即處理" : "待追蹤",
      dueDate: analysis.level === "優先關懷" ? todayPlus(3) : todayPlus(7)
    };
  }

  function renderTeacherDashboard(remoteRecords) {
    const user = state.currentUser;
    if (user && user.role === "teacher") {
      $("#teacherGreeting").textContent = `${safeText(user.name, "教師")}，這裡整理東華學生需要被看見的學習訊號`;
    }

    const records = Array.isArray(remoteRecords) ? remoteRecords : buildTeacherRecords();
    const query = ($("#studentSearch").value || "").trim().toLowerCase();
    const risk = $("#riskFilter").value || "all";
    const filtered = records.filter((record) => {
      const haystack = `${record.studentName} ${record.studentId} ${record.courseName} ${record.summary} ${record.tags.join(" ")}`.toLowerCase();
      return (!query || haystack.includes(query)) && (risk === "all" || record.level === risk);
    });

    renderTeacherKpis(records);
    const list = $("#studentRiskList");
    if (!filtered.length) {
      list.innerHTML = `<div class="detail-item"><strong>目前沒有符合條件的學生</strong><span>學生送出學習近況後，這裡會依關懷層級出現追蹤名單。</span></div>`;
      return;
    }

    list.innerHTML = filtered.map((record) => `
      <button class="student-row" type="button" data-student-id="${escapeHtml(record.studentId)}">
        <div><strong>${escapeHtml(record.studentName)}</strong><span>${escapeHtml(record.department || record.college || "東華大學")}</span></div>
        <div><strong>${escapeHtml(record.courseName || "學習近況")}</strong><span>${escapeHtml(record.tags.join("、") || "待釐清")}</span></div>
        <div><strong>${escapeHtml(record.followUpDate || "待安排")}</strong><span>追蹤日期</span></div>
        <span class="risk-pill ${riskClass(record.level)}">${escapeHtml(record.level)}</span>
      </button>
    `).join("");

    $$(".student-row", list).forEach((button) => {
      button.addEventListener("click", () => {
        $$(".student-row", list).forEach((row) => row.classList.remove("active"));
        button.classList.add("active");
        renderStudentDetail(records.find((record) => record.studentId === button.dataset.studentId));
      });
    });
  }

  function buildTeacherRecords() {
    const latestByStudent = new Map();
    state.checkins.forEach((checkin) => {
      const current = latestByStudent.get(checkin.studentId);
      if (!current || String(checkin.createdAt).localeCompare(String(current.createdAt)) > 0) {
        latestByStudent.set(checkin.studentId, checkin);
      }
    });

    return Array.from(latestByStudent.values()).map((checkin) => {
      const user = state.users.find((entry) => entry.id === checkin.studentId) || {};
      return {
        studentId: checkin.studentId,
        studentName: checkin.studentName || user.name || "學生",
        email: checkin.email || user.email || "",
        college: checkin.college || user.college || "",
        department: checkin.department || user.department || "",
        year: checkin.year || user.year || "",
        courseName: checkin.courseName,
        level: checkin.analysis.level,
        score: checkin.analysis.score,
        tags: checkin.analysis.tags || [],
        reasons: checkin.analysis.reasons || [],
        recommendations: checkin.analysis.recommendations || [],
        summary: checkin.analysis.summary,
        followUpDate: checkin.followUpDate,
        preferredSupport: checkin.preferredSupport,
        createdAt: checkin.createdAt
      };
    }).sort((a, b) => b.score - a.score || String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function renderTeacherKpis(records) {
    const counts = {
      total: records.length,
      urgent: records.filter((r) => r.level === "立即轉介").length,
      priority: records.filter((r) => r.level === "優先關懷").length,
      watch: records.filter((r) => r.level === "觀察").length
    };
    const kpis = [
      ["待檢視學生", counts.total],
      ["立即轉介", counts.urgent],
      ["優先關懷", counts.priority],
      ["觀察追蹤", counts.watch]
    ];
    $("#teacherKpis").innerHTML = kpis.map(([label, value]) => `
      <div class="kpi"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
    `).join("");
  }

  function renderStudentDetail(record) {
    if (!record) return;
    const notes = state.teacherNotes.filter((note) => note.studentId === record.studentId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    $("#studentDetail").innerHTML = `
      <div class="detail-header">
        <div>
          <h3>${escapeHtml(record.studentName)}</h3>
          <p>${escapeHtml([record.college, record.department, record.year].filter(Boolean).join(" · ") || "東華大學")}</p>
        </div>
        <span class="risk-pill ${riskClass(record.level)}">${escapeHtml(record.level)} · ${record.score}</span>
      </div>
      <div class="detail-list">
        <div class="detail-item"><strong>近期摘要</strong><span>${escapeHtml(record.summary)}</span></div>
        <div class="detail-item"><strong>主要原因</strong><span>${escapeHtml(record.reasons.join("；"))}</span></div>
        <div class="detail-item"><strong>建議行動</strong><span>${escapeHtml(record.recommendations.join("；"))}</span></div>
        <div class="detail-item"><strong>學生希望獲得</strong><span>${escapeHtml(record.preferredSupport || "尚未填寫")}</span></div>
      </div>
      <form class="note-form" data-note-student="${escapeHtml(record.studentId)}">
        <label>
          <span>教師追蹤紀錄</span>
          <textarea name="note" rows="4" placeholder="記錄晤談重點、下一次追蹤時間或已完成的協助。"></textarea>
        </label>
        <button class="primary-button" type="submit"><i data-lucide="file-pen-line"></i>保存教師紀錄</button>
      </form>
      <div class="detail-list" style="margin-top:14px">
        ${notes.length ? notes.map((note) => `<div class="detail-item"><strong>${escapeHtml(new Date(note.createdAt).toLocaleString("zh-TW"))}</strong><span>${escapeHtml(note.note)}</span></div>`).join("") : `<div class="detail-item"><strong>尚未新增教師紀錄</strong><span>保存後會列在這裡，方便下一次追蹤。</span></div>`}
      </div>
    `;
    $(".note-form", $("#studentDetail")).addEventListener("submit", handleTeacherNote);
    iconRefresh();
  }

  function handleTeacherNote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const noteText = safeText(new FormData(form).get("note"));
    if (!noteText) return;
    const note = {
      noteId: uid("note"),
      createdAt: new Date().toISOString(),
      teacherEmail: state.currentUser ? state.currentUser.email : "",
      teacherName: state.currentUser ? state.currentUser.name : "",
      studentId: form.dataset.noteStudent,
      note: noteText,
      visibility: "teacher"
    };
    state.teacherNotes.push(note);
    saveState();
    syncWrite("teacherNote", { note });
    showToast("已保存教師追蹤紀錄。");
    renderStudentDetail(buildTeacherRecords().find((record) => record.studentId === note.studentId));
  }

  function exportTeacherCsv() {
    const records = buildTeacherRecords();
    const headers = ["studentId", "studentName", "college", "department", "courseName", "level", "score", "tags", "summary", "followUpDate"];
    const rows = [headers.join(",")].concat(records.map((record) => headers.map((header) => {
      const value = Array.isArray(record[header]) ? record[header].join("、") : record[header];
      return `"${String(value === undefined ? "" : value).replace(/"/g, '""')}"`;
    }).join(",")));
    const blob = new Blob([`\ufeff${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ndhu-learning-alert-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function syncWrite(action, payload) {
    const endpoint = state.settings.gasEndpoint;
    if (!endpoint) return Promise.resolve({ ok: false, skipped: true });
    const body = JSON.stringify(Object.assign({ action, clientTime: new Date().toISOString() }, payload));
    return fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    }).catch((error) => {
      console.warn("GAS write failed", error);
      showToast("雲端同步暫時未完成，資料已先保存在這台裝置。");
    });
  }

  function fetchTeacherDashboard() {
    const endpoint = state.settings.gasEndpoint;
    const token = state.settings.teacherToken || (state.currentUser && state.currentUser.teacherToken) || "";
    if (!endpoint || !token) {
      renderTeacherDashboard();
      return;
    }
    jsonp("teacherDashboard", { token })
      .then((data) => {
        if (data && Array.isArray(data.records)) renderTeacherDashboard(data.records);
        else renderTeacherDashboard();
      })
      .catch(() => renderTeacherDashboard());
  }

  function jsonp(action, params) {
    return new Promise((resolve, reject) => {
      const endpoint = state.settings.gasEndpoint;
      if (!endpoint) {
        reject(new Error("missing endpoint"));
        return;
      }
      const callback = `__ndhuLearningCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const query = new URLSearchParams(Object.assign({}, params, { action, callback }));
      const script = document.createElement("script");
      const separator = endpoint.includes("?") ? "&" : "?";
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("timeout"));
      }, 16000);

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

  function openSettings() {
    $("#gasEndpointInput").value = state.settings.gasEndpoint || "";
    $("#teacherTokenInput").value = state.settings.teacherToken || "";
    $("#settingsDialog").showModal();
  }

  function saveSettingsFromDialog(event) {
    event.preventDefault();
    state.settings.gasEndpoint = safeText($("#gasEndpointInput").value);
    state.settings.teacherToken = safeText($("#teacherTokenInput").value);
    saveSettings();
    $("#settingsDialog").close();
    showToast("連線設定已保存。");
  }

  function setupUsageConsent() {
    const dialog = $("#usageConsentDialog");
    const check = $("#usageConsentCheck");
    const button = $("#usageConsentButton");
    const form = $("#usageConsentForm");
    if (!dialog || !check || !button || !form) return;

    check.addEventListener("change", () => {
      button.disabled = !check.checked;
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!check.checked) return;
      localStorage.setItem(CONSENT_KEY, "accepted");
      if (dialog.open) dialog.close();
    });

    if (localStorage.getItem(CONSENT_KEY) !== "accepted") {
      check.checked = false;
      button.disabled = true;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.classList.remove("hidden");
    }
  }

  function bindPasswordToggles() {
    $$("[data-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = $("input", button.closest(".password-field"));
        if (!input) return;
        const shouldShow = input.type === "password";
        input.type = shouldShow ? "text" : "password";
        button.setAttribute("aria-label", shouldShow ? "隱藏密碼" : "顯示密碼");
        button.setAttribute("title", shouldShow ? "隱藏密碼" : "顯示密碼");
        button.innerHTML = `<i data-lucide="${shouldShow ? "eye-off" : "eye"}"></i>`;
        iconRefresh();
      });
    });
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

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      button.addEventListener("click", () => showToast("這個瀏覽器目前不支援語音輸入，可以先用文字和東東聊。"));
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
      if (event.error !== "no-speech") showToast("語音輸入暫時無法使用，請改用文字輸入。");
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
        showToast("語音輸入正在準備中，請稍後再試一次。");
      }
    });
  }

  function bindEvents() {
    bindAuthRoleTabs();
    bindAuthModeTabs();
    bindPasswordToggles();
    setupVoiceInput();
    setAuthMode("login");
    $("#authForm").addEventListener("submit", handleAuthSubmit);
    $("#forgotPasswordButton").addEventListener("click", requestPasswordReset);
    $("#resetPasswordButton").addEventListener("click", applyPasswordReset);
    $("#chatForm").addEventListener("submit", handleChatSubmit);
    $("#saveCheckinButton").addEventListener("click", handleSaveCheckin);
    $("#studentDoorButton").addEventListener("click", () => {
      if (isAuthenticatedCurrentUser("student")) showView("student");
      else showLoginRequired("student");
    });
    $("#teacherDoorButton").addEventListener("click", () => {
      if (isAuthenticatedCurrentUser("teacher")) showView("teacher");
      else showLoginRequired("teacher");
    });
    $("#homeButton").addEventListener("click", () => showView("entry"));
    $("#logoutButton").addEventListener("click", () => {
      setCurrentUser(null);
      clearAuthSecrets();
      showView("entry");
      setAuthMode("login");
      showToast("已登出。");
    });
    $("#settingsButton").addEventListener("click", openSettings);
    $("#saveSettingsButton").addEventListener("click", saveSettingsFromDialog);
    $("#refreshTeacherButton").addEventListener("click", fetchTeacherDashboard);
    $("#exportCsvButton").addEventListener("click", exportTeacherCsv);
    $("#studentSearch").addEventListener("input", () => renderTeacherDashboard());
    $("#riskFilter").addEventListener("change", () => renderTeacherDashboard());

    ["courseName", "difficultyType", "difficultyScore", "attendanceStatus", "preferredSupport"].forEach((id) => {
      $(`#${id}`).addEventListener("input", () => {
        const analysis = analyzeLearningNeed(Object.assign({}, readCheckinContext(), { text: "" }));
        updateStudentRisk(analysis);
        renderStudentRecommendation(analysis);
      });
    });
  }

  function init() {
    loadState();
    populateCollegeSelects();
    renderLandingNeeds();
    renderStudentSelects();
    bindEvents();
    setupUsageConsent();
    if (isAuthenticatedCurrentUser("student")) showView("student");
    else if (isAuthenticatedCurrentUser("teacher")) showView("teacher");
    else if (state.currentUser) {
      setCurrentUser(null);
      showView("entry");
    }
    else showView("entry");
    iconRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
