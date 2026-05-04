(function () {
  "use strict";

  const SETTINGS_KEY = "ndhu.learning.anan.settings.v1";
  const CONSENT_KEY = "ndhu.learning.anan.usageConsent.v2";
  const DEFAULT_SETTINGS = { gasEndpoint: "" };
  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    messages: [],
    context: {
      nickname: "",
      college: "",
      department: ""
    }
  };

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
      state.settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
    } catch (err) {
      state.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    $("#toastRegion").appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }

  function populateContextFields() {
    const collegeSelect = $("#contextCollege");
    const departmentSelect = $("#contextDepartment");
    if (!collegeSelect || !departmentSelect) return;
    const colleges = (window.NDHULearningData && window.NDHULearningData.colleges) || [];
    const options = colleges.map((college) => `<option value="${escapeHtml(college.name)}">${escapeHtml(college.name)}</option>`).join("");
    collegeSelect.innerHTML = `<option value="">先不選</option>${options}`;

    function updateDepartments() {
      const selected = colleges.find((college) => college.name === collegeSelect.value);
      const departmentOptions = selected
        ? selected.departments.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")
        : "";
      departmentSelect.innerHTML = `<option value="">先不選</option>${departmentOptions}`;
    }

    collegeSelect.addEventListener("change", updateDepartments);
    updateDepartments();
  }

  function collectContext() {
    state.context = {
      nickname: safeText($("#nicknameInput") ? $("#nicknameInput").value : ""),
      college: safeText($("#contextCollege") ? $("#contextCollege").value : ""),
      department: safeText($("#contextDepartment") ? $("#contextDepartment").value : "")
    };
    return state.context;
  }

  function showHome() {
    $("#homeView").classList.remove("hidden");
    $("#chatView").classList.add("hidden");
  }

  function showChat() {
    collectContext();
    $("#homeView").classList.add("hidden");
    $("#chatView").classList.remove("hidden");
    ensureIntro();
    window.setTimeout(() => $("#chatInput").focus(), 80);
    iconRefresh();
  }

  function ensureIntro() {
    if (state.messages.length) return;
    addMessage("agent", "我是安安，東華的 AI 學習陪伴。你不用先把事情整理好，可以直接用很口語的方式說：哪門課、哪個作業、哪段進度讓你卡住。");
    addMessage("agent", "我會陪你把眼前的狀況慢慢說清楚，再整理成一個比較容易開始的小步驟。這段對話只暫存在目前畫面，想留下來可以按「下載對話紀錄」。");
  }

  function addMessage(role, text, timestamp = new Date().toISOString(), meta = "") {
    const message = {
      role,
      text,
      timestamp: isoTime(timestamp),
      meta,
      inputMethod: role === "user" ? nextInputMethod : ""
    };
    state.messages.push(message);
    renderMessage(message);
    updateDownloadState();
    return message;
  }

  function renderMessage(message) {
    const node = document.createElement("article");
    node.className = `message ${message.role}`;
    const speaker = message.role === "user" ? "你" : "安安";
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

    addMessage("user", text);
    input.value = "";
    input.dataset.inputMethod = "text";
    nextInputMethod = "text";

    const pending = renderPendingMessage();
    const reply = await resolveAgentReply(text);
    const replyMessage = {
      role: "agent",
      text: reply.text,
      timestamp: new Date().toISOString(),
      meta: reply.source === "llm" ? "AI 回覆" : ""
    };
    state.messages.push(replyMessage);
    updateMessageNode(pending, replyMessage.text, replyMessage.timestamp, replyMessage.meta);
    updateDownloadState();
  }

  function renderPendingMessage() {
    const node = document.createElement("article");
    node.className = "message agent pending";
    node.innerHTML = `
      <strong>安安</strong>
      <span>安安正在讀你的訊息...</span>
      <time datetime="${escapeHtml(new Date().toISOString())}">${escapeHtml(formatMessageTime())}</time>
    `;
    $("#chatLog").appendChild(node);
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
    return node;
  }

  async function resolveAgentReply(text) {
    if (!state.settings.gasEndpoint) return { text: buildLocalReply(text), source: "local" };
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
      context: collectContext(),
      history,
      clientTime: new Date().toISOString(),
      privacy: "Do not store this conversation. Use it only to generate this reply."
    };

    try {
      const data = await jsonp("llmChat", { payload: JSON.stringify(payload) }, 30000);
      if (data && data.ok && safeText(data.reply)) return { text: safeText(data.reply), source: "llm" };
      if (data && data.error) showToast(`安安的 AI 連線暫時未完成：${data.error}`);
    } catch (err) {
      showToast("AI 連線暫時不穩，安安先用本機方式陪你整理。");
    }
    return { text: buildLocalReply(text), source: "local" };
  }

  function buildLocalReply(text) {
    const lower = text.toLowerCase();
    const context = collectContext();
    const name = context.nickname || "你";
    const area = detectLearningArea(lower);
    const firstStep = buildFirstStep(area, text);
    return [
      `${name}，你已經把最難開口的部分說出來了。安安先幫你整理成：事情卡在學習任務本身，也卡在不知道怎麼向別人求助。`,
      firstStep,
      "你可以接著只回我一個很短的答案：這件事最卡的是「看不懂」、「做不完」、「不知道怎麼問」，還是「不知道先排哪一個」？"
    ].join("\n");
  }

  function detectLearningArea(text) {
    if (/(作業|報告|專題|繳交|deadline|拖)/i.test(text)) return "assignment";
    if (/(考|期中|期末|測驗|小考|讀書)/i.test(text)) return "exam";
    if (/(問老師|開口|助教|討論|不敢問)/i.test(text)) return "asking";
    if (/(時間|打工|通勤|社團|排程|來不及)/i.test(text)) return "time";
    if (/(聽不懂|概念|公式|先備|跨域|跟不上)/i.test(text)) return "concept";
    return "general";
  }

  function buildFirstStep(area, text) {
    const course = extractCourse(text);
    const courseText = course ? `「${course}」` : "這件事";
    const steps = {
      assignment: `我們先不急著把整份作業做完。你可以先把${courseText}分成三欄：已經會的、卡住的、需要問人的，先找出最容易動手的 10 分鐘。`,
      exam: `如果是準備考試，先不要從頭讀到尾。你可以先列出 ${courseText} 最可能被考、但你最不穩的三個小主題，安安再陪你排順序。`,
      asking: `如果卡在不知道怎麼問，可以先把想問的話寫得很粗糙也沒關係。安安可以幫你改成比較自然、禮貌、讓對方容易回應的句子。`,
      time: `如果是時間被切碎，先找一段最小的空檔就好。今天只安排一個 15 分鐘任務，先讓事情重新開始流動。`,
      concept: `如果是概念跟不上，先抓一個最常出現、但你最不確定的名詞或公式。安安可以陪你用白話拆一次。`,
      general: `我們先把 ${courseText} 縮小：不用一次解決全部，先說出最困擾你的一個畫面或一句話就好。`
    };
    return steps[area] || steps.general;
  }

  function extractCourse(text) {
    const cleaned = safeText(text)
      .replace(/^安安[，,、\s]*/u, "")
      .replace(/^我/u, "");
    const match = cleaned.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,12})(課|作業|報告|考試|期中|期末)/);
    return match ? match[0] : "";
  }

  function jsonp(action, params, timeoutMs = 16000) {
    return new Promise((resolve, reject) => {
      const endpoint = state.settings.gasEndpoint;
      if (!endpoint) {
        reject(new Error("missing endpoint"));
        return;
      }
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

  function updateDownloadState() {
    const hasConversation = state.messages.some((message) => message.role === "user");
    ["#downloadChatButton", "#downloadNavButton"].forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = !hasConversation;
    });
  }

  function downloadConversation() {
    const meaningful = state.messages.filter((message) => message.role === "user" || message.role === "agent");
    if (!meaningful.some((message) => message.role === "user")) {
      showToast("還沒有可下載的對話。");
      return;
    }
    const lines = [
      "國立東華大學學習關懷預警系統 LCEAS",
      "安安 AI 學習陪伴對話紀錄",
      `下載時間：${new Date().toLocaleString("zh-TW")}`,
      "",
      "提醒：這份檔案由你自行下載保存，可帶去和諮商師或信任的人討論；本頁不建立教師後台紀錄。",
      ""
    ].concat(meaningful.map((message) => {
      const speaker = message.role === "user" ? "你" : "安安";
      return `[${new Date(message.timestamp).toLocaleString("zh-TW")}] ${speaker}\n${message.text}`;
    }));
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anan-learning-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearConversation() {
    state.messages = [];
    $("#chatLog").innerHTML = "";
    ensureIntro();
    updateDownloadState();
    showToast("畫面上的對話已清除。");
  }

  function openSettings() {
    $("#gasEndpointInput").value = state.settings.gasEndpoint || "";
    $("#settingsDialog").showModal();
  }

  function saveSettingsFromDialog(event) {
    event.preventDefault();
    state.settings.gasEndpoint = safeText($("#gasEndpointInput").value);
    saveSettings();
    $("#settingsDialog").close();
    showToast("連線設定已保存。");
  }

  function setupUsageConsent() {
    const dialog = $("#usageConsentDialog");
    const check = $("#usageConsentCheck");
    const button = $("#usageConsentButton");
    const form = $("#usageConsentForm");
    const opener = $("#openConsentButton");
    if (!dialog || !check || !button || !form) return;

    function openDialog(force = false) {
      if (!force && localStorage.getItem(CONSENT_KEY) === "accepted") return;
      check.checked = false;
      button.disabled = true;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.classList.remove("hidden");
    }

    check.addEventListener("change", () => {
      button.disabled = !check.checked;
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!check.checked) return;
      localStorage.setItem(CONSENT_KEY, "accepted");
      if (dialog.open) dialog.close();
    });
    if (opener) opener.addEventListener("click", () => openDialog(true));
    openDialog(false);
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
      button.addEventListener("click", () => showToast("這個瀏覽器目前不支援語音輸入，可以先用文字和安安聊。"));
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
    $("#startChatButton").addEventListener("click", () => {
      const firstThought = safeText($("#firstThoughtInput").value);
      showChat();
      if (firstThought) {
        $("#chatInput").value = firstThought;
        $("#chatInput").focus();
      }
    });
    $("#startChatNavButton").addEventListener("click", showChat);
    $(".brand").addEventListener("click", (event) => {
      event.preventDefault();
      showHome();
    });
    $("#chatForm").addEventListener("submit", handleChatSubmit);
    $("#downloadChatButton").addEventListener("click", downloadConversation);
    $("#downloadNavButton").addEventListener("click", downloadConversation);
    $("#clearChatButton").addEventListener("click", clearConversation);
    $("#settingsButton").addEventListener("click", openSettings);
    $("#saveSettingsButton").addEventListener("click", saveSettingsFromDialog);
  }

  function init() {
    loadSettings();
    populateContextFields();
    bindEvents();
    setupUsageConsent();
    setupVoiceInput();
    updateDownloadState();
    iconRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
