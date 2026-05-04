function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || "status");
  let result;
  try {
    if (action === "llmChat") {
      result = chatWithOpenAI_(parseJson_(params.payload || "{}", {}));
    } else {
      result = {
        ok: true,
        service: "ndhu-lceas-anan",
        privacy: "This endpoint does not write conversations to a spreadsheet.",
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
      : { ok: true, message: "安安 AI 代理已就緒；此版本不保存對話。" };
    return output_(result, payload.callback);
  } catch (err) {
    return output_({ ok: false, error: err && err.message ? err.message : String(err) }, payload.callback);
  }
}

function manualSetup() {
  return "LCEAS 安安 AI 代理已就緒。請在 Script Properties 設定 OPENAI_API_KEY；此版本不建立教師後台，也不保存對話。";
}

function chatWithOpenAI_(input) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("尚未設定 OPENAI_API_KEY。");
  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-5.4-mini";
  const context = input.context || {};
  const history = Array.isArray(input.history) ? input.history.slice(-10) : [];
  const profile = [
    context.nickname ? "稱呼：" + context.nickname : "",
    context.college ? "學院：" + context.college : "",
    context.department ? "系所：" + context.department : ""
  ].filter(Boolean).join("；");

  const prompt = [
    "你是「安安」，國立東華大學學習關懷預警系統 LCEAS 的 AI 學習陪伴角色。",
    "角色設定：請扮演一位溫和、友善、能陪學生整理學習困難的導師型 AI。你要接住學生的上一句話，讓學生願意繼續說，而不是句點式結束。",
    "任務範圍：協助釐清課程進度、作業、考試準備、跨域修課、時間安排、學習策略與求助表達。把模糊的大問題整理成一個可行的小步驟。",
    "隱私邊界：不要說你已保存、通報或交給教師；本系統不建立教師後台，也不保存完整對話。若學生想保留內容，可以提醒學生自行下載對話紀錄。",
    "專業邊界：你可以提供學習陪伴與溫和引導，但不要宣稱自己取代心理諮商、醫療或緊急服務；除非學生主動提到急迫危險，不要主動使用驚嚇或危機字眼。",
    "語氣：繁體中文、自然、柔和、具體，不要像公告，不要像客服範本。稱呼學生時保持尊重，不過度親暱。",
    "格式：2 到 4 個短段落；可以偶爾使用短條列；最後一定問一個很容易回答的追問。",
    "學生提供的背景：" + (profile || "未提供"),
    "最近對話：" + JSON.stringify(history),
    "學生最新訊息：" + String(input.message || "")
  ].join("\n");

  const payload = {
    model: model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "你只能回覆繁體中文。你是安安，國立東華大學 LCEAS 的溫和友善學習陪伴導師型 AI；不保存對話、不建立教師後台、不取代專業諮商。" }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      }
    ],
    max_output_tokens: 900
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
  return {
    ok: true,
    model: model,
    reply: reply || "我有收到。你可以再補一句目前最卡的地方，安安會陪你往下整理。"
  };
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
