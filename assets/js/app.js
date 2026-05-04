(function () {
  "use strict";

  const STORE_KEY = "ndhu.learning.warning.state.v1";
  const SESSION_KEY = "ndhu.learning.warning.currentUser";
  const SETTINGS_KEY = "ndhu.learning.warning.settings";
  const DEFAULT_CONFIG = {
    gasEndpoint: "",
    teacherToken: ""
  };

  const quickNeeds = [
    "我聽得懂上課，但作業寫不出來",
    "考試快到了，不知道怎麼安排",
    "我開始缺課或跟不上進度",
    "我想問老師，但不知道怎麼開口",
    "跨系或跨域課程有落差",
    "讀很多次還是抓不到重點",
    "時間被打工、社團或家務卡住",
    "我需要有人幫我排下一步"
  ];

  const supportOptions = [
    "整理讀書計畫",
    "向授課教師提問",
    "預約導師晤談",
    "找助教或同儕討論",
    "調整作業與考試策略",
    "轉介學習或諮商資源"
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
    landing.innerHTML = "";
    studentNeeds.innerHTML = "";

    quickNeeds.forEach((need) => {
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

      const studentButton = landingButton.cloneNode(true);
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

  function setAuthRole(role) {
    $$("[data-auth-role]").forEach((button) => {
      const active = button.dataset.authRole === role;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    $$("[data-student-only]").forEach((node) => node.classList.toggle("hidden", role !== "student"));
    $$("[data-teacher-only]").forEach((node) => node.classList.toggle("hidden", role !== "teacher"));
    $("#authTitle").textContent = role === "student" ? "學生註冊 / 登入" : "教師註冊 / 登入";
    $("#authHint").textContent = role === "student"
      ? "留下基本資料後，你的學習近況可以被保存並持續追蹤。"
      : "教師端會依授權範圍顯示學生摘要、預警層級與追蹤事項。";
    $("#authSubmitText").textContent = role === "student" ? "進入學生入口" : "進入教師工作台";
  }

  function getAuthRole() {
    const active = $("[data-auth-role].active");
    return active ? active.dataset.authRole : "student";
  }

  function handleAuthSubmit(event) {
    event.preventDefault();
    const role = getAuthRole();
    const form = new FormData(event.currentTarget);
    const user = {
      id: role === "student" ? safeText(form.get("studentId"), uid("student")) : safeText(form.get("teacherId"), uid("teacher")),
      role,
      name: safeText(form.get("name"), role === "student" ? "東華學生" : "東華教師"),
      email: safeText(form.get("email")),
      college: safeText(form.get("college")),
      department: safeText(form.get("department")),
      year: safeText(form.get("year")),
      advisorEmail: safeText(form.get("advisorEmail")),
      teacherToken: safeText(form.get("teacherToken")) || state.settings.teacherToken,
      consent: form.get("consent") === "on",
      updatedAt: new Date().toISOString()
    };

    upsertUser(user);
    if (user.teacherToken) {
      state.settings.teacherToken = user.teacherToken;
      saveSettings();
    }
    setCurrentUser(user);
    saveState();
    syncWrite("register", { user });
    if (role === "student") {
      showView("student");
      renderStudentProfile();
      showToast("已進入學生學習入口。");
    } else {
      showView("teacher");
      renderTeacherDashboard();
      showToast("已進入教師預警工作台。");
    }
  }

  function upsertUser(user) {
    const key = `${user.role}:${user.email || user.id}`;
    const index = state.users.findIndex((entry) => `${entry.role}:${entry.email || entry.id}` === key);
    if (index >= 0) state.users[index] = Object.assign({}, state.users[index], user);
    else state.users.push(user);
  }

  function ensureStudentSession() {
    if (state.currentUser && state.currentUser.role === "student") return state.currentUser;
    const user = {
      id: uid("student"),
      role: "student",
      name: "東華學生",
      email: "",
      college: "人文社會科學學院",
      department: "尚未選擇",
      year: "",
      advisorEmail: "",
      consent: false,
      updatedAt: new Date().toISOString()
    };
    setCurrentUser(user);
    upsertUser(user);
    saveState();
    return user;
  }

  function showView(view) {
    $("#entryView").classList.toggle("hidden", view !== "entry");
    $("#studentView").classList.toggle("hidden", view !== "student");
    $("#teacherView").classList.toggle("hidden", view !== "teacher");
    if (view === "student") {
      ensureStudentSession();
      renderStudentProfile();
      ensureChatIntro();
    }
    if (view === "teacher") renderTeacherDashboard();
    iconRefresh();
  }

  function renderStudentProfile() {
    const user = state.currentUser || ensureStudentSession();
    $("#studentAvatar").textContent = safeText(user.name, "學").slice(0, 1);
    $("#studentName").textContent = safeText(user.name, "東華學生");
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
    addChatMessage("agent", "我是小東。你可以先說最困擾你的一件事，不需要一次講完整。我會先幫你整理問題，再一起決定下一步。");
    addChatMessage("agent", "如果你願意，可以包含課程名稱、最近卡住的作業或考試、已經試過的方法，以及希望老師怎麼協助你。");
  }

  function addChatMessage(role, text) {
    const message = document.createElement("div");
    message.className = `message ${role === "user" ? "user" : "agent"}`;
    const speaker = role === "user" ? "你" : "小東";
    message.innerHTML = `<strong>${speaker}</strong><span>${escapeHtml(text).replace(/\n/g, "<br>")}</span>`;
    $("#chatLog").appendChild(message);
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
  }

  function handleChatSubmit(event) {
    event.preventDefault();
    const input = $("#chatInput");
    const text = input.value.trim();
    if (!text) return;
    const user = ensureStudentSession();
    addChatMessage("user", text);
    input.value = "";

    const context = readCheckinContext();
    const analysis = analyzeLearningNeed(Object.assign({}, context, { text }));
    const response = buildAgentResponse(analysis);
    addChatMessage("agent", response);
    updateStudentRisk(analysis);
    renderStudentRecommendation(analysis);

    const conversation = {
      conversationId: uid("conv"),
      createdAt: new Date().toISOString(),
      studentId: user.id,
      studentName: user.name,
      college: user.college,
      department: user.department,
      text,
      agentReply: response,
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
        "今天不要獨自承受這件事，先讓一位教師、導師或家人知道你需要協助。",
        "課業安排可以稍後處理，現在最重要的是安全與有人陪伴。"
      ];
    }

    const course = context.courseName ? `「${context.courseName}」` : "這門課";
    const steps = [];
    if (tags.includes("概念理解") || tags.includes("先備知識")) {
      steps.push(`把 ${course} 最不懂的三個概念寫成問題，帶去問授課教師、助教或同學。`);
    }
    if (tags.includes("作業進度")) {
      steps.push("把作業切成「已懂、卡住、需要求助」三欄，先完成能拿分的部分。");
    }
    if (tags.includes("考試焦慮")) {
      steps.push("先排出兩個 40 分鐘複習時段，只處理最常出題或最能補分的單元。");
    }
    if (tags.includes("時間管理")) {
      steps.push("把接下來七天的固定行程列出來，先找出兩段可以穩定學習的時間。");
    }
    if (tags.includes("出缺席")) {
      steps.push("今天先向導師或授課教師說明近況，請對方協助確認補救與追蹤方式。");
    }
    if (!steps.length) {
      steps.push("先寫下目前卡住的一句話，再補上你已經試過的方法。");
      steps.push("選一位可以求助的人，今天先傳一封簡短訊息。");
    }
    if (level === "優先關懷") {
      steps.unshift("建議在三天內安排一次導師或授課教師晤談。");
    } else if (level === "觀察") {
      steps.unshift("建議一週內回來更新一次近況，確認方法是否有效。");
    }
    return steps.slice(0, 3);
  }

  function summarizeNeed(context, tags, level) {
    const course = safeText(context.courseName, "尚未指定課程");
    const issue = tags.length ? tags.join("、") : safeText(context.difficultyType, "學習困難");
    return `${course} 目前主要需要處理：${issue}。關懷層級為 ${level}。`;
  }

  function buildAgentResponse(analysis) {
    const intro = analysis.level === "立即轉介"
      ? "我先把最重要的事放前面：你的安全比課業更優先。"
      : "我先幫你整理一下，這不是你一個人硬撐就一定要解掉的問題。";
    const reason = analysis.reasons.length ? `我看到的重點是：${analysis.reasons.join("；")}。` : "";
    const steps = analysis.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n");
    return `${intro}\n${reason}\n接下來可以先做這幾步：\n${steps}`;
  }

  function updateStudentRisk(analysis) {
    const effective = analysis || { level: "穩定", score: 12, reasons: ["先描述今天遇到的學習困難，系統會幫你整理重點。"] };
    $("#studentRiskLabel").textContent = effective.level;
    $("#studentRiskMeter").value = effective.score;
    $("#studentRiskReason").textContent = effective.reasons.join("；");
  }

  function renderStudentRecommendation(analysis) {
    const box = $("#studentRecommendation");
    if (!analysis) {
      box.innerHTML = "填寫近況或開始對話後，這裡會整理你可以先做的下一步。";
      return;
    }
    box.innerHTML = `
      <strong>${escapeHtml(analysis.summary)}</strong>
      <ul>${analysis.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    `;
  }

  function handleSaveCheckin() {
    const user = ensureStudentSession();
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
      advisorEmail: user.advisorEmail,
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
    showToast("已保存學習近況，教師端會看見摘要與追蹤重點。");
  }

  function toRiskSignal(user, analysis, source) {
    return {
      signalId: uid("risk"),
      createdAt: new Date().toISOString(),
      studentId: user.id,
      studentName: user.name,
      advisorEmail: user.advisorEmail,
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
      $("#teacherGreeting").textContent = `${safeText(user.name, "教師")}，這裡整理需要被看見的學習訊號`;
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

  function bindEvents() {
    bindAuthRoleTabs();
    $("#authForm").addEventListener("submit", handleAuthSubmit);
    $("#continueLocalButton").addEventListener("click", () => {
      ensureStudentSession();
      showView("student");
    });
    $("#chatForm").addEventListener("submit", handleChatSubmit);
    $("#saveCheckinButton").addEventListener("click", handleSaveCheckin);
    $("#studentDoorButton").addEventListener("click", () => showView("student"));
    $("#teacherDoorButton").addEventListener("click", () => {
      if (!state.currentUser || state.currentUser.role !== "teacher") setAuthRole("teacher");
      if (state.currentUser && state.currentUser.role === "teacher") showView("teacher");
      else showView("entry");
    });
    $("#homeButton").addEventListener("click", () => showView("entry"));
    $("#logoutButton").addEventListener("click", () => {
      setCurrentUser(null);
      showView("entry");
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
    if (state.currentUser && state.currentUser.role === "student") showView("student");
    else if (state.currentUser && state.currentUser.role === "teacher") showView("teacher");
    else showView("entry");
    iconRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
