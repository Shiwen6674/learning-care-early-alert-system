(function () {
  "use strict";

  const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw9A4n_9XskiPQidcaZLSbkweI1BXG_QMywC5BXnIUv_YIOVEyhu5VlYPid0yuxJtuZ/exec";
  const SETTINGS_KEY = "ndhu.learning.anan.settings.v2";
  const CONSENT_KEY = "ndhu.learning.anan.usageConsent.v3";
  const DEFAULT_SETTINGS = { gasEndpoint: GAS_ENDPOINT };
  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    messages: []
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
    if (!state.settings.gasEndpoint) state.settings.gasEndpoint = GAS_ENDPOINT;
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
      meta: reply.source === "llm" ? "AI" : ""
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
      <span>...</span>
      <time datetime="${escapeHtml(new Date().toISOString())}">${escapeHtml(formatMessageTime())}</time>
    `;
    $("#chatLog").appendChild(node);
    $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
    return node;
  }

  async function resolveAgentReply(text) {
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
      history,
      clientTime: new Date().toISOString()
    };

    try {
      const data = await jsonp("llmChat", { payload: JSON.stringify(payload) }, 30000);
      if (data && data.ok && safeText(data.reply)) return { text: safeText(data.reply), source: "llm" };
      if (data && data.error) {
        return { text: `目前沒有收到 AI 回覆。GAS 回傳：${data.error}`, source: "system" };
      }
    } catch (err) {
      return { text: "目前沒有收到 AI 回覆。請確認 GAS Web App 已部署為可存取，並且 Script Properties 中有 OPENAI_API_KEY 或 API_KEY。", source: "system" };
    }
    return { text: "目前沒有收到 AI 回覆。", source: "system" };
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

  function updateDownloadState() {
    const hasConversation = state.messages.some((message) => message.role === "user");
    const button = $("#downloadNavButton");
    if (button) button.disabled = !hasConversation;
  }

  function downloadConversation() {
    const meaningful = state.messages.filter((message) => message.role === "user" || message.role === "agent");
    if (!meaningful.some((message) => message.role === "user")) {
      showToast("目前還沒有可下載的內容。");
      return;
    }
    const lines = [
      "LCEAS 國立東華大學學習關懷預警系統",
      `下載時間：${new Date().toLocaleString("zh-TW")}`,
      ""
    ].concat(meaningful.map((message) => {
      const speaker = message.role === "user" ? "你" : "安安";
      return `[${new Date(message.timestamp).toLocaleString("zh-TW")}] ${speaker}\n${message.text}`;
    }));
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anan-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearConversation() {
    state.messages = [];
    $("#chatLog").innerHTML = "";
    updateDownloadState();
  }

  function openSettings() {
    $("#gasEndpointInput").value = state.settings.gasEndpoint || GAS_ENDPOINT;
    $("#settingsDialog").showModal();
  }

  function saveSettingsFromDialog(event) {
    event.preventDefault();
    state.settings.gasEndpoint = safeText($("#gasEndpointInput").value, GAS_ENDPOINT);
    saveSettings();
    $("#settingsDialog").close();
    showToast("已更新連線設定。");
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
      $("#chatInput").focus();
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
    $(".brand").addEventListener("click", (event) => event.preventDefault());
    $("#chatForm").addEventListener("submit", handleChatSubmit);
    $("#downloadNavButton").addEventListener("click", downloadConversation);
    $("#clearChatButton").addEventListener("click", clearConversation);
    $("#settingsButton").addEventListener("click", openSettings);
    $("#saveSettingsButton").addEventListener("click", saveSettingsFromDialog);
  }

  function init() {
    loadSettings();
    bindEvents();
    setupUsageConsent();
    setupVoiceInput();
    updateDownloadState();
    iconRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
