const DEFAULT_SPREADSHEET_ID = "1MCCPpfNke0UimmqHsqhO3Qx23lnT5qVE4jo2hh7PDnw";
const CONVERSATION_SHEET_NAME = "AI對話紀錄";
const DAILY_TURN_LIMIT = 25;
const LIMIT_MESSAGE = "同學您好，您的問題可以進一步洽詢學校導師、行政人員或心理諮商中心，相信可以獲得更好的協助。";
const NDHU_ACADEMIC_SUPPORT_CONTEXT = [
  "教務處課規查詢：學生可至教務處網頁→教務資訊系統→課務→課規查詢系統，查詢各系院基礎、系核心、專業選修等課程規劃。課規查詢系統：https://sys.ndhu.edu.tw/aa/class/RuleSearch/rulebasic.aspx",
  "教務處學程分類：院基礎學程約15至27學分，由學院所屬學系共同基礎課程組成；系核心學程約21至33學分，由學系必修基礎課程組成；專業選修學程約15至27學分，由學系專業領域學習主題課程組成。",
  "東華課程地圖：可查各學系課程架構、課程連結與生涯進路圖。課程地圖：https://web.ndhu.edu.tw/CrsMap/CrsMap.aspx",
  "各系網站通常會呈現課程目標、核心能力、課程地圖與畢業就業方向；若學生對本系沒有興趣或想轉系，安安應協助比較目前系所與可能目標系所的課程、能力與就業方向，再建議找導師、系辦或教務處確認轉系規定與可行性。"
].join("\n");
const NDHU_FINANCIAL_SUPPORT_CONTEXT = [
  "經濟壓力相關資源：東華設有起飛學生獎助學金、清寒獎助與校內外獎助學金、學雜費減免、弱勢助學、就學貸款、學生急難救助金、工讀資訊等。學務處生活輔導組：https://osa.ndhu.edu.tw/p/412-1005-8315.php?Lang=zh-tw",
  "起飛團隊：辦公室在學務處學活園區C102，Email：ndhuicanfly@gms.ndhu.edu.tw，電話：03-890-6215、03-890-6233。起飛獎助學金資訊：https://icanfly.ndhu.edu.tw/p/412-1162-16549.php?Lang=zh-tw",
  "獎助學金與清寒相關：學務處生活輔導組獎助學金申請資訊，若有疑問可洽生輔組葉俊良先生，電話：03-890-6219，Email：ycliang@gms.ndhu.edu.tw。",
  "學雜費減免：可查學務處生活輔導組學雜費減免資訊，包含申請資格、時程與注意事項。學雜費減免：https://osa.ndhu.edu.tw/p/412-1005-22905.php?Lang=zh-tw",
  "急難救助：學生遇突遭變故、重傷重病、家庭重大變故或急需協助，可查學務處生活輔導組學生急難救助金與相關申請表單。學生急難救助金：https://osa.ndhu.edu.tw/p/412-1005-18223.php",
  "相關表單：獎助學金、清寒學生家庭狀況表與急難救助申請表可至生活輔導組表單頁查詢。表單頁：https://osa.ndhu.edu.tw/p/403-1005-2751-1.php?Lang=zh-tw",
  "安安遇到經濟壓力訊息時，應先理解壓力如何影響學習，再建議學生下載TXT或PDF諮詢摘要，帶去找導師、系辦或學務處生活輔導組討論可用資源。"
].join("\n");
const NDHU_COUNSELING_SUPPORT_CONTEXT = [
  "心理諮商輔導中心：位於學生活動中心西側二樓，可電話、Email或現場預約初談。電話：03-890-6896、03-890-6270，Email：pcc@gms.ndhu.edu.tw。中心網站：https://pcc1.ndhu.edu.tw/",
  "心理諮商輔導中心服務包含個別諮商、團體諮商、心理測驗與心靈講座，可協助個人、人際、學業或生涯相關困擾。",
  "校安中心24小時緊急電話：03-890-6995；校安手機：0937-295995。若學生表達立即危險、自傷傷人風險或安全疑慮，應優先鼓勵立即聯繫校安、119、110或身邊可信任的人。",
  "情緒困擾、失戀、霸凌、被霸凌、焦慮、憂鬱、恐慌、睡不著等關鍵字出現時，不要主動說會送出摘要或通報；先溫和詢問：你需要我協助你整理一段可聯繫諮商中心、導師、系辦或校安的文字嗎？",
  "若學生在前後文中明確表示願意、同意、可以、好、OK、拜託、麻煩你等，安安才協助整理一段可傳給相關單位的訊息，並提供聯絡方式。除非系統真的有自動發送功能，否則不要宣稱已代為送出。"
].join("\n");
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
  const dailyState = getDailyTurnState_(email, todayKey_(), input.clientDailyTurnCount);
  const currentDailyCount = dailyState.dailyTurnCount;
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
    "情境一：若學生說對科系沒有興趣、想轉系、不知道讀這個系要做什麼、課程與未來出路不符合期待，請主動觸發教務與生涯探索情境；當輪回覆要自然提供教務處課規查詢與東華課程地圖連結，提醒他對照院基礎、系核心、專業選修、核心能力、課程目標與畢業就業方向；可以建議下載諮詢摘要，帶去找導師、系辦或教務處討論轉系或修課調整的可能性。不要直接替學生做轉系決定。",
    "情境二：若學生提到經濟壓力、學費、生活費、打工太多、清寒、家裡經濟、急難、租金或就學貸款，請主動觸發經濟支持情境；當輪回覆要自然提供起飛獎助、清寒或校內外獎助、弱勢助學、學雜費減免、急難救助、工讀等校內資源與官方連結；請建議他下載TXT或PDF諮詢摘要，帶去聯繫系上、導師或學務處生活輔導組。",
    "情境三：若學生提到情緒不佳、失戀、霸凌、被霸凌、焦慮、憂鬱、恐慌、睡不著、孤單、很痛苦等，請主動觸發情緒支持與轉介詢問情境；先接住感受，不要主動設定送出摘要或通報。先問他是否需要你協助整理一段可聯繫諮商中心、導師、系辦或校安的文字；若學生明確同意，當輪回覆要協助整理聯繫文字，並提供心理諮商輔導中心電話03-890-6896、03-890-6270、Email pcc@gms.ndhu.edu.tw 與中心網站 https://pcc1.ndhu.edu.tw/，若有安全疑慮則也提供校安24小時電話03-890-6995與0937-295995。除非系統真的有發送功能，不要宣稱已代為送出。若學生有立即危險或安全疑慮，請優先鼓勵立即聯繫校安、119、110或身邊可信任的人。",
    "語氣：繁體中文、自然、柔和、像可靠的大姐姐或學習導師。若學生提供稱呼，第一則回覆自然使用一次該稱呼，之後適度使用，不要過度親暱或重複。",
    "格式：通常 1 到 3 個短段落、220 字以內；只有在學生需要整理多件事時才用短條列。問題要自然，不必每次都用同一種結尾；但若適合延續對話，請留一個容易回答的小問題，不要讓句子中斷。",
    "可使用的東華教務與生涯資料：\n" + NDHU_ACADEMIC_SUPPORT_CONTEXT,
    "可使用的東華經濟支持資料：\n" + NDHU_FINANCIAL_SUPPORT_CONTEXT,
    "可使用的東華心理與安全支持資料：\n" + NDHU_COUNSELING_SUPPORT_CONTEXT,
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
  const reply = withScenarioFollowup_(extractOutputText_(data), input, history);
  if (!reply) throw new Error("OpenAI 未回傳可顯示的文字。");
  const saved = tryAppendConversationTurn_(input, reply, model, email, turnLimit, currentDailyCount);
  if (saved && saved.limitReached) return saved;
  return {
    ok: true,
    model: model,
    reply: reply,
    dailyTurnCount: saved.dailyTurnCount,
    dailyTurnLimit: saved.dailyTurnLimit,
    logSaved: saved.logSaved,
    logError: saved.logError || ""
  };
}

function withScenarioFollowup_(reply, input, history) {
  const text = String(reply || "").trim();
  const latest = String(input.message || "");
  const contextText = [
    latest,
    JSON.stringify(history || [])
  ].join("\n");
  const notes = [];
  const hasAcademicNeed = /(沒興趣|沒有興趣|想轉系|轉系|換系|不想讀|不適合這個系|未來出路|畢業出路|就業方向|讀這個系|科系.*不合|系上.*沒興趣)/.test(contextText);
  const hasFinancialNeed = /(經濟|學費|生活費|打工|清寒|家裡.*錢|沒錢|急難|租金|就學貸款|弱勢助學|獎學金|獎助|繳不出|負擔不起)/.test(contextText);
  const hasEmotionalNeed = /(失戀|霸凌|被霸凌|情緒|焦慮|憂鬱|恐慌|睡不著|孤單|很痛苦|諮商中心|諮商|心情很差|壓力大到|快撐不住)/.test(contextText);
  const hasConsentToContact = /(願意|同意|可以|好|OK|ok|拜託|麻煩|需要|幫我|請你)/.test(latest);
  if (hasAcademicNeed && !/(sys\.ndhu\.edu\.tw\/aa\/class\/RuleSearch|web\.ndhu\.edu\.tw\/CrsMap|課規查詢系統|課程地圖)/.test(text)) {
    notes.push("和科系方向有關的事，可以先用兩個東華官方入口把資訊看清楚：教務處課規查詢系統 https://sys.ndhu.edu.tw/aa/class/RuleSearch/rulebasic.aspx ，以及東華課程地圖 https://web.ndhu.edu.tw/CrsMap/CrsMap.aspx 。先對照你現在系上的院基礎、系核心、專業選修，再看系網上的課程目標、核心能力和畢業就業方向；如果你想和導師或系辦談轉系或修課調整，也可以先下載這次諮詢摘要帶去討論。");
  }
  if (hasFinancialNeed && !/(icanfly\.ndhu\.edu\.tw|osa\.ndhu\.edu\.tw|起飛獎助|急難救助|學雜費減免|生活輔導組|生輔組)/.test(text)) {
    notes.push("如果經濟壓力已經影響到上課或準備作業，可以先看東華起飛獎助學金 https://icanfly.ndhu.edu.tw/p/412-1162-16549.php?Lang=zh-tw 、學務處生活輔導組 https://osa.ndhu.edu.tw/p/412-1005-8315.php?Lang=zh-tw 、學雜費減免 https://osa.ndhu.edu.tw/p/412-1005-22905.php?Lang=zh-tw ，以及學生急難救助金 https://osa.ndhu.edu.tw/p/412-1005-18223.php 。你也可以下載TXT或PDF諮詢摘要，帶去找導師、系辦或學務處生活輔導組談可用資源。");
  }
  if (hasEmotionalNeed && !hasConsentToContact && !/(要不要我幫你|需要我協助|我可以幫你整理|聯繫諮商中心|聯絡諮商中心)/.test(text)) {
    notes.push("如果你願意，我也可以幫你整理一段比較好開口的文字，讓你可以拿去聯繫心理諮商輔導中心、導師、系辦或校安；你只要回我「需要」或「先不用」就好。");
  }
  if (hasEmotionalNeed && hasConsentToContact && !/(03-890-6896|pcc@gms\.ndhu\.edu\.tw|03-890-6270|pcc1\.ndhu\.edu\.tw)/.test(text)) {
    notes.push("我可以先幫你整理成這樣：我最近因為情緒或人際狀況，已經影響到學習和生活，想預約談一談，也想知道可以怎麼獲得協助。東華心理諮商輔導中心可用電話03-890-6896、03-890-6270，Email pcc@gms.ndhu.edu.tw，或網站 https://pcc1.ndhu.edu.tw/ 聯繫；如果你覺得有立即安全疑慮，請優先聯繫校安24小時電話03-890-6995或0937-295995。");
  }
  return [text].concat(notes).filter(Boolean).join("\n\n");
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

function tryAppendConversationTurn_(input, reply, model, email, turnLimit, fallbackCount) {
  try {
    const saved = appendConversationTurn_(input, reply, model, email, turnLimit);
    if (saved && saved.limitReached) return saved;
    return Object.assign({ logSaved: true }, saved);
  } catch (err) {
    return {
      ok: true,
      logSaved: false,
      logError: err && err.message ? err.message : String(err),
      dailyTurnCount: Math.min((Number(fallbackCount) || 0) + 1, turnLimit),
      dailyTurnLimit: turnLimit
    };
  }
}

function getDailyTurnState_(email, dateKey, clientDailyTurnCount) {
  const fallbackCount = Math.max(0, Number(clientDailyTurnCount) || 0);
  try {
    return {
      dailyTurnCount: countDailyTurns_(email, dateKey),
      source: "sheet"
    };
  } catch (err) {
    return {
      dailyTurnCount: fallbackCount,
      source: "client",
      error: err && err.message ? err.message : String(err)
    };
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
