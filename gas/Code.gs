const DEFAULT_SPREADSHEET_ID = "1MCCPpfNke0UimmqHsqhO3Qx23lnT5qVE4jo2hh7PDnw";
const CONVERSATION_SHEET_NAME = "AI對話紀錄";
const DAILY_TURN_LIMIT = 25;
const LIMIT_MESSAGE = "同學您好，您的問題可以進一步洽詢學校導師、行政人員或心理諮商中心，相信可以獲得更好的協助。";
const CONVERSATION_HEADERS = [
  "時間戳記",
  "日期",
  "Email",
  "姓名或稱呼",
  "學號",
  "年級",
  "學院",
  "系所",
  "對話次數",
  "每日輪次",
  "輸入方式",
  "學生訊息",
  "AI回覆",
  "模型",
  "前端時間",
  "最近對話JSON"
];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || "status");
  let result;
  try {
    if (action === "llmChat") {
      result = chatWithOpenAI_(parseJson_(params.payload || "{}", {}));
    } else if (action === "reportSummary") {
      result = summarizeConversation_(parseJson_(params.payload || "{}", {}));
    } else if (action === "setup") {
      getConversationSheet_();
      result = { ok: true, message: "AI對話紀錄 試算表已就緒。", generatedAt: new Date().toISOString() };
    } else {
      result = {
        ok: true,
        service: "ndhu-lceas-anan",
        mode: "llm-proxy",
        generatedAt: new Date().toISOString()
      };
    }
  } catch (err) {
    result = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  return output_(result, params.callback);
}

function doPost(e) {
  let payload = {};
  try {
    payload = parseBody_(e);
    const action = String(payload.action || "");
    const result = action === "llmChat"
      ? chatWithOpenAI_(payload.input || payload)
      : action === "reportSummary"
        ? summarizeConversation_(payload.input || payload)
        : { ok: true, message: "安安 AI 代理已就緒。" };
    return output_(result, payload.callback);
  } catch (err) {
    return output_({ ok: false, error: err && err.message ? err.message : String(err) }, payload.callback);
  }
}

function manualSetup() {
  getConversationSheet_();
  return "LCEAS 安安 AI 代理與 AI對話紀錄 試算表已就緒。請在 Script Properties 設定 OPENAI_API_KEY 或 API_KEY。";
}

function chatWithOpenAI_(input) {
  const apiKey = getScriptProperty_(["OPENAI_API_KEY", "API_KEY", "OPENAI_KEY"]);
  if (!apiKey) throw new Error("尚未設定 OPENAI_API_KEY 或 API_KEY。");
  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-5-mini";
  const context = input.context || {};
  const email = normalizeEmail_(context.email || input.email || "");
  const turnLimit = Number(input.dailyTurnLimit || DAILY_TURN_LIMIT) || DAILY_TURN_LIMIT;
  if (!email) throw new Error("缺少學生 Email，無法確認每日對話上限。");
  const currentDailyCount = countDailyTurns_(email, todayKey_());
  if (currentDailyCount >= turnLimit) {
    return {
      ok: false,
      limitReached: true,
      error: "DAILY_LIMIT_REACHED",
      message: LIMIT_MESSAGE,
      dailyTurnCount: currentDailyCount,
      dailyTurnLimit: turnLimit
    };
  }
  const history = Array.isArray(input.history) ? input.history.slice(-10) : [];
  const profile = [
    context.nickname ? "稱呼：" + context.nickname : "",
    context.email ? "Email：" + context.email : "",
    context.studentId ? "學號：" + context.studentId : "",
    context.grade ? "年級：" + context.grade : "",
    context.college ? "學院：" + context.college : "",
    context.department ? "系所：" + context.department : ""
  ].filter(Boolean).join("；");

  const prompt = [
    "你是「安安」，國立東華大學學習關懷預警系統 LCEAS 的 AI 學習陪伴角色。",
    "角色設定：請像一位溫和、自然、有經驗的學習陪伴導師。你的重點不是給標準答案，而是讓學生覺得有人聽懂他，並把混亂的學習卡點慢慢整理成可開始的小方向。",
    "對話方式：用學生自己的字詞接話，語氣要像真人談話，順著上一句自然回應。可以先短短承接情緒或情境，再用一兩句幫他釐清卡住處；有需要時才給一個很小、今天做得到的下一步。",
    "回應策略：如果學生只說很短或很模糊，先陪他多說一點，不要急著列方法。如果學生已經描述具體課程或作業，就幫他抓優先順序與第一步。如果學生情緒明顯低落，先接住感受，再輕輕轉向學習行動。",
    "任務範圍：協助釐清課程進度、作業、考試準備、跨域修課、時間安排、學習策略與求助表達。把模糊的大問題整理成一個可行的小步驟。",
    "避免事項：不要固定套用同一種開場；不要每次都條列；不要像公告、客服、教條或冷冰冰的助理；不要說「以下是幾個步驟」「我建議你先做清單式評估」這類模板句；不要用「我是安安」自我介紹開場；不要用責備、催促或過度正能量。",
    "隱私邊界：不要主動談後台或資料保存。若學生直接詢問資料處理，只用一句話簡短說明對話會依系統設定留存於學校紀錄，用於學習關懷服務。",
    "專業邊界：你提供學習陪伴與溫和引導，不取代校內專業諮詢或正式課業評量；除非學生主動提到急迫危險，不要主動使用驚嚇或危機字眼。",
    "語氣：繁體中文、自然、柔和、像可靠的大姐姐或學習導師。若學生提供稱呼，第一則回覆自然使用一次該稱呼，之後適度使用，不要過度親暱或重複。",
    "格式：通常 1 到 3 個短段落、220 字以內；只有在學生需要整理多件事時才用短條列。問題要自然，不必每次都用同一種結尾；但若適合延續對話，請留一個容易回答的小問題，不要讓句子中斷。",
    "學生提供的背景：" + (profile || "未提供"),
    "最近對話：" + JSON.stringify(history),
    "學生最新訊息：" + String(input.message || "")
  ].join("\n");

  const payload = {
    model: model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "你只能回覆繁體中文。你是安安，國立東華大學 LCEAS 的自然友善學習陪伴導師型 AI。回覆要像真人接話，有溫度、會釐清、會把下一步變小；避免固定模板、客服語氣、公告語氣和生硬條列。" }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      }
    ],
    reasoning: { effort: "minimal" },
    text: { verbosity: "low" },
    max_output_tokens: 1600
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const data = JSON.parse(response.getContentText() || "{}");
  if (status >= 300) throw new Error(data.error && data.error.message ? data.error.message : "OpenAI 回覆失敗");
  const reply = extractOutputText_(data);
  if (!reply) throw new Error("OpenAI 未回傳可顯示的文字。");
  const saved = appendConversationTurn_(input, reply, model, email, turnLimit);
  if (saved && saved.limitReached) return saved;
  return {
    ok: true,
    model: model,
    reply: reply,
    dailyTurnCount: saved.dailyTurnCount,
    dailyTurnLimit: saved.dailyTurnLimit
  };
}

function summarizeConversation_(input) {
  const apiKey = getScriptProperty_(["OPENAI_API_KEY", "API_KEY", "OPENAI_KEY"]);
  if (!apiKey) throw new Error("尚未設定 OPENAI_API_KEY 或 API_KEY。");
  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-5-mini";
  const context = input.context || {};
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const profile = [
    context.nickname ? "姓名或稱呼：" + context.nickname : "",
    context.studentId ? "學號：" + context.studentId : "",
    context.grade ? "年級：" + context.grade : "",
    context.college ? "學院：" + context.college : "",
    context.department ? "科系：" + context.department : "",
    input.sessionNumber ? "對話次數：第 " + input.sessionNumber + " 次" : ""
  ].filter(Boolean).join("；");

  const prompt = [
    "請為學生整理一段「對使用者說」的學習對話綜合分析。",
    "請使用繁體中文與第二人稱，語氣溫和、具體、有支持感，不要像診斷報告，也不要像客服範本。",
    "內容應包含：學生這次主要談到的學習卡點、可能正在卡住的原因、已經出現的努力或線索、接下來一個最小可行方向。",
    "不要新增學生沒有提過的重大風險，不要做心理或醫療診斷，不要提教師後台或資料保存。",
    "格式：3 到 5 個短段落，可以自然稱呼學生一次，不要條列成制式清單；請完整收句，不要讓最後一句中斷。",
    "學生背景：" + (profile || "未提供"),
    "逐筆對話：" + JSON.stringify(messages)
  ].join("\n");

  const payload = {
    model: model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "你是安安的學習對話整理助手。你要把完整對話整理成給學生本人閱讀的溫和綜合分析。" }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      }
    ],
    reasoning: { effort: "minimal" },
    text: { verbosity: "low" },
    max_output_tokens: 1600
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const data = JSON.parse(response.getContentText() || "{}");
  if (status >= 300) throw new Error(data.error && data.error.message ? data.error.message : "OpenAI 回覆失敗");
  const summary = extractOutputText_(data);
  if (!summary) throw new Error("OpenAI 未回傳可顯示的文字。");
  return {
    ok: true,
    model: model,
    summary: summary
  };
}

function appendConversationTurn_(input, reply, model, email, turnLimit) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const context = input.context || {};
    const dateKey = todayKey_();
    const dailyTurnCount = countDailyTurns_(email, dateKey);
    if (dailyTurnCount >= turnLimit) {
      return {
        ok: false,
        limitReached: true,
        error: "DAILY_LIMIT_REACHED",
        message: LIMIT_MESSAGE,
        dailyTurnCount: dailyTurnCount,
        dailyTurnLimit: turnLimit
      };
    }
    const nextDailyTurn = dailyTurnCount + 1;
    const sheet = getConversationSheet_();
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, CONVERSATION_HEADERS.length).setValues([[
      new Date(),
      dateKey,
      email,
      context.nickname || "",
      context.studentId || "",
      context.grade || "",
      context.college || "",
      context.department || "",
      input.sessionNumber || "",
      nextDailyTurn,
      input.inputMethod || "",
      String(input.message || ""),
      reply,
      model,
      input.clientTime || "",
      JSON.stringify(input.history || [])
    ]]);
    return {
      ok: true,
      dailyTurnCount: nextDailyTurn,
      dailyTurnLimit: turnLimit
    };
  } finally {
    lock.releaseLock();
  }
}

function countDailyTurns_(email, dateKey) {
  const normalized = normalizeEmail_(email);
  if (!normalized) return 0;
  const sheet = getConversationSheet_();
  if (sheet.getLastRow() <= 1) return 0;
  const headers = sheet.getRange(1, 1, 1, CONVERSATION_HEADERS.length).getValues()[0].map(String);
  const dateIndex = headers.indexOf("日期");
  const emailIndex = headers.indexOf("Email");
  if (dateIndex < 0 || emailIndex < 0) return 0;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONVERSATION_HEADERS.length).getValues();
  return values.reduce(function (count, row) {
    return count + (sheetDateKey_(row[dateIndex]) === String(dateKey) && normalizeEmail_(row[emailIndex]) === normalized ? 1 : 0);
  }, 0);
}

function getConversationSheet_() {
  const ss = spreadsheet_();
  if (!ss) throw new Error("找不到試算表，請設定 SPREADSHEET_ID 或使用已綁定試算表的 Apps Script。");
  let sheet = ss.getSheetByName(CONVERSATION_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONVERSATION_SHEET_NAME);
  const current = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), CONVERSATION_HEADERS.length)).getValues()[0].map(String)
    : [];
  let needsHeader = sheet.getLastRow() === 0;
  CONVERSATION_HEADERS.forEach(function (header, index) {
    if (current[index] !== header) needsHeader = true;
  });
  if (needsHeader) {
    sheet.getRange(1, 1, 1, CONVERSATION_HEADERS.length).setValues([CONVERSATION_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function spreadsheet_() {
  const id = getScriptProperty_(["SPREADSHEET_ID", "SHEET_ID"]) || DEFAULT_SPREADSHEET_ID;
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function todayKey_() {
  return Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
}

function sheetDateKey_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Taipei", "yyyy-MM-dd");
  }
  return String(value || "").trim();
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return { raw: e.postData.contents };
  }
}

function extractOutputText_(data) {
  if (data.output_text) return data.output_text;
  const output = data.output || [];
  const parts = [];
  output.forEach(function (item) {
    (item.content || []).forEach(function (content) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
      if (content.type === "text" && content.text) parts.push(content.text);
    });
  });
  return parts.join("");
}

function output_(payload, callback) {
  const json = JSON.stringify(payload);
  if (callback) {
    const safe = String(callback).match(/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/) ? String(callback) : "callback";
    return ContentService.createTextOutput(safe + "(" + json + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function parseJson_(text, fallback) {
  try {
    return JSON.parse(text || "");
  } catch (err) {
    return fallback;
  }
}

function getScriptProperty_(names) {
  const props = PropertiesService.getScriptProperties();
  for (let i = 0; i < names.length; i += 1) {
    const value = props.getProperty(names[i]);
    if (value) return value;
  }
  return "";
}
