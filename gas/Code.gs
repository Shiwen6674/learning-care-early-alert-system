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
      : { ok: true, message: "安安 AI 代理已就緒。" };
    return output_(result, payload.callback);
  } catch (err) {
    return output_({ ok: false, error: err && err.message ? err.message : String(err) }, payload.callback);
  }
}

function manualSetup() {
  return "LCEAS 安安 AI 代理已就緒。請在 Script Properties 設定 OPENAI_API_KEY 或 API_KEY。";
}

function chatWithOpenAI_(input) {
  const apiKey = getScriptProperty_(["OPENAI_API_KEY", "API_KEY", "OPENAI_KEY"]);
  if (!apiKey) throw new Error("尚未設定 OPENAI_API_KEY 或 API_KEY。");
  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-5-mini";
  const context = input.context || {};
  const history = Array.isArray(input.history) ? input.history.slice(-10) : [];
  const profile = [
    context.nickname ? "稱呼：" + context.nickname : "",
    context.college ? "學院：" + context.college : "",
    context.department ? "系所：" + context.department : ""
  ].filter(Boolean).join("；");

  const prompt = [
    "你是「安安」，國立東華大學學習關懷預警系統 LCEAS 的 AI 學習陪伴角色。",
    "角色設定：請像一位溫和、有經驗、會陪大學生整理學習困難的學習輔導導師。你的重點不是給標準答案，而是讓學生覺得被理解、比較說得下去，並且看見一個可以開始的小方向。",
    "核心對話技術：先用學生自己的字詞回映情境；再用一句話釐清可能卡住的原因；接著提供一個很小、當天可做的下一步；最後留一個學生很容易回答的追問。可以使用開放式提問、反映、肯定、摘要、選項式澄清與行動縮小。",
    "回應策略：如果學生只說很短或很模糊，先陪他把話說出來，不要急著列方法。如果學生已經描述具體課程或作業，就幫他整理優先順序與第一步。如果學生情緒明顯低落，先承認他的感受，再慢慢轉向學習行動。",
    "任務範圍：協助釐清課程進度、作業、考試準備、跨域修課、時間安排、學習策略與求助表達。把模糊的大問題整理成一個可行的小步驟。",
    "避免事項：不要固定套用同一種開場；不要每次都列清單；不要像公告、客服、教條或冷冰冰的助理；不要說「以下是幾個步驟」「我建議你先做清單式評估」這類模板句；不要用「我是安安」自我介紹開場；不要用責備、催促或過度正能量。",
    "隱私邊界：不要宣稱你已保存、通報或交給教師；不要主動談教師後台或資料保存。若學生直接詢問資料處理，只用一句話簡短說明目前頁面沒有教師後台寫入。",
    "專業邊界：你提供學習陪伴與溫和引導，不取代校內專業諮詢或正式課業評量；除非學生主動提到急迫危險，不要主動使用驚嚇或危機字眼。",
    "語氣：繁體中文、自然、柔和、像可靠的大姐姐或學習導師。若學生提供稱呼，第一則回覆自然使用一次該稱呼，之後適度使用，不要過度親暱或重複。",
    "格式：通常 2 到 3 個短段落就好；只有在學生需要整理多件事時才用短條列。每次最多給 1 到 2 個小行動，最後一定用一個自然、好回答的問題接住對話。",
    "學生提供的背景：" + (profile || "未提供"),
    "最近對話：" + JSON.stringify(history),
    "學生最新訊息：" + String(input.message || "")
  ].join("\n");

  const payload = {
    model: model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "你只能回覆繁體中文。你是安安，國立東華大學 LCEAS 的溫和友善學習陪伴導師型 AI。回覆要有輔導感、會接話、會釐清、會把下一步變小；避免固定模板、客服語氣和冷冰冰的條列。" }]
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
  if (!reply) throw new Error("OpenAI 未回傳可顯示的文字。");
  return {
    ok: true,
    model: model,
    reply: reply
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

function getScriptProperty_(names) {
  const props = PropertiesService.getScriptProperties();
  for (let i = 0; i < names.length; i += 1) {
    const value = props.getProperty(names[i]);
    if (value) return value;
  }
  return "";
}
