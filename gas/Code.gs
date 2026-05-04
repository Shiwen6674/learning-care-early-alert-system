const SPREADSHEET_ID = "1MCCPpfNke0UimmqHsqhO3Qx23lnT5qVE4jo2hh7PDnw";
const SHEETS = {
  settings: "Settings",
  colleges: "CollegesDepartments",
  students: "Students",
  teachers: "Teachers",
  checkins: "LearningCheckins",
  conversations: "Conversations",
  risks: "RiskSignals",
  plans: "InterventionPlans",
  notes: "TeacherNotes",
  referrals: "Referrals",
  dashboard: "AnalyticsDashboard",
  audit: "AuditLog"
};

const HEADERS = {
  Settings: ["key", "value", "description", "updated_at"],
  CollegesDepartments: ["college", "department", "degree_level", "source_note", "active"],
  Students: ["student_id", "name", "email", "college", "department", "year", "advisor_email", "consent_status", "status", "created_at", "last_seen_at", "risk_level", "risk_score", "primary_need", "latest_summary"],
  Teachers: ["teacher_id", "name", "email", "role", "college", "department", "can_view_scope", "status", "created_at", "last_seen_at"],
  LearningCheckins: ["checkin_id", "timestamp", "student_id", "student_name", "email", "college", "department", "year", "advisor_email", "course_name", "difficulty_type", "difficulty_score", "attendance_status", "preferred_support", "follow_up_date", "risk_level", "risk_score", "tags", "summary", "recommendations_json", "raw_json"],
  Conversations: ["conversation_id", "timestamp", "student_id", "student_name", "college", "department", "message", "agent_reply", "risk_level", "risk_score", "tags", "summary", "visibility_to_teacher", "raw_json"],
  RiskSignals: ["signal_id", "timestamp", "student_id", "student_name", "advisor_email", "source", "category", "severity", "evidence", "risk_score", "status", "due_date", "resolved_at"],
  InterventionPlans: ["plan_id", "created_at", "student_id", "teacher_email", "priority", "concern", "action_plan", "student_strength", "next_meeting_date", "status", "outcome_note"],
  TeacherNotes: ["note_id", "timestamp", "teacher_email", "teacher_name", "student_id", "note", "visibility"],
  Referrals: ["referral_id", "timestamp", "student_id", "referral_type", "unit", "reason", "status", "handled_by", "handled_at", "note"],
  AnalyticsDashboard: ["metric", "value", "formula_or_source", "updated_at"],
  AuditLog: ["timestamp", "actor_email", "role", "action", "ok", "message"]
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || "status");
  let result;
  try {
    setup_();
    if (action === "setup") {
      assertAdmin_(params);
      setup_();
      result = { ok: true, message: "資料表已就緒", generatedAt: new Date().toISOString() };
    } else if (action === "teacherDashboard") {
      assertTeacher_(params);
      result = { ok: true, records: buildTeacherDashboard_(), generatedAt: new Date().toISOString() };
    } else if (action === "studentProfile") {
      result = { ok: true, profile: buildStudentProfile_(params.studentId || ""), generatedAt: new Date().toISOString() };
    } else {
      result = { ok: true, service: "ndhu-learning-warning", generatedAt: new Date().toISOString() };
    }
    audit_(params.email || "", params.role || "", action, true, "");
  } catch (err) {
    result = { ok: false, error: err && err.message ? err.message : String(err) };
    audit_(params.email || "", params.role || "", action, false, result.error);
  }
  return output_(result, params.callback);
}

function doPost(e) {
  let payload = {};
  let action = "";
  try {
    setup_();
    payload = parseBody_(e);
    action = String(payload.action || "");
    let result;
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (action === "register") result = register_(payload.user || {});
      else if (action === "submitCheckin") result = submitCheckin_(payload.checkin || {});
      else if (action === "submitConversation") result = submitConversation_(payload.conversation || {});
      else if (action === "teacherNote") result = teacherNote_(payload.note || {});
      else if (action === "riskAnalysis") result = { ok: true, analysis: analyzeWithOpenAI_(payload.input || payload) };
      else result = { ok: true, message: "已收到資料" };
    } finally {
      lock.releaseLock();
    }
    audit_(payload.email || "", payload.role || "", action, true, "");
    return output_(result, payload.callback);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    audit_(payload.email || "", payload.role || "", action, false, message);
    return output_({ ok: false, error: message }, payload.callback);
  }
}

function manualSetup() {
  setup_();
  return "東華大學學生學習預警輔導系統資料表已就緒。";
}

function setup_() {
  Object.keys(HEADERS).forEach(function (name) {
    getSheet_(name, HEADERS[name]);
  });
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return { raw: e.postData.contents };
  }
}

function ss_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name, headers) {
  const ss = ss_();
  if (!ss) throw new Error("找不到試算表，請確認 SPREADSHEET_ID 或從試算表開啟 Apps Script。");
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const current = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0].map(String)
    : [];
  let needsHeader = sheet.getLastRow() === 0;
  headers.forEach(function (header, index) {
    if (current[index] !== header) needsHeader = true;
  });
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function register_(user) {
  const role = String(user.role || "student");
  if (role === "teacher") {
    upsertByKey_(SHEETS.teachers, "email", normalizeTeacher_(user));
  } else {
    upsertByKey_(SHEETS.students, "student_id", normalizeStudent_(user));
  }
  return { ok: true, role: role };
}

function submitCheckin_(checkin) {
  const analysis = checkin.analysis || {};
  appendObject_(SHEETS.checkins, {
    checkin_id: checkin.checkinId || uuid_("checkin"),
    timestamp: checkin.createdAt || new Date(),
    student_id: checkin.studentId || "",
    student_name: checkin.studentName || "",
    email: checkin.email || "",
    college: checkin.college || "",
    department: checkin.department || "",
    year: checkin.year || "",
    advisor_email: checkin.advisorEmail || "",
    course_name: checkin.courseName || "",
    difficulty_type: checkin.difficultyType || "",
    difficulty_score: checkin.difficultyScore || "",
    attendance_status: checkin.attendanceStatus || "",
    preferred_support: checkin.preferredSupport || "",
    follow_up_date: checkin.followUpDate || "",
    risk_level: analysis.level || "",
    risk_score: analysis.score || "",
    tags: (analysis.tags || []).join("、"),
    summary: analysis.summary || "",
    recommendations_json: JSON.stringify(analysis.recommendations || []),
    raw_json: JSON.stringify(checkin)
  });
  updateStudentRisk_(checkin);
  if (Number(analysis.score || 0) >= 35) {
    appendRisk_(checkin, "checkin");
  }
  return { ok: true };
}

function submitConversation_(conversation) {
  const analysis = conversation.analysis || {};
  appendObject_(SHEETS.conversations, {
    conversation_id: conversation.conversationId || uuid_("conv"),
    timestamp: conversation.createdAt || new Date(),
    student_id: conversation.studentId || "",
    student_name: conversation.studentName || "",
    college: conversation.college || "",
    department: conversation.department || "",
    message: conversation.text || "",
    agent_reply: conversation.agentReply || "",
    risk_level: analysis.level || "",
    risk_score: analysis.score || "",
    tags: (analysis.tags || []).join("、"),
    summary: analysis.summary || "",
    visibility_to_teacher: "summary",
    raw_json: JSON.stringify(conversation)
  });
  if (Number(analysis.score || 0) >= 55) {
    appendRisk_(conversation, "conversation");
  }
  return { ok: true };
}

function teacherNote_(note) {
  appendObject_(SHEETS.notes, {
    note_id: note.noteId || uuid_("note"),
    timestamp: note.createdAt || new Date(),
    teacher_email: note.teacherEmail || "",
    teacher_name: note.teacherName || "",
    student_id: note.studentId || "",
    note: note.note || "",
    visibility: note.visibility || "teacher"
  });
  return { ok: true };
}

function normalizeStudent_(user) {
  return {
    student_id: user.id || user.studentId || uuid_("student"),
    name: user.name || "",
    email: user.email || "",
    college: user.college || "",
    department: user.department || "",
    year: user.year || "",
    advisor_email: user.advisorEmail || "",
    consent_status: user.consent ? "agreed" : "pending",
    status: "active",
    created_at: new Date(),
    last_seen_at: new Date(),
    risk_level: "",
    risk_score: "",
    primary_need: "",
    latest_summary: ""
  };
}

function normalizeTeacher_(user) {
  return {
    teacher_id: user.id || user.teacherId || uuid_("teacher"),
    name: user.name || "",
    email: user.email || "",
    role: "teacher",
    college: user.college || "",
    department: user.department || "",
    can_view_scope: user.department || user.college || "",
    status: "active",
    created_at: new Date(),
    last_seen_at: new Date()
  };
}

function updateStudentRisk_(checkin) {
  const analysis = checkin.analysis || {};
  const row = normalizeStudent_({
    id: checkin.studentId,
    name: checkin.studentName,
    email: checkin.email,
    college: checkin.college,
    department: checkin.department,
    year: checkin.year,
    advisorEmail: checkin.advisorEmail,
    consent: true
  });
  row.risk_level = analysis.level || "";
  row.risk_score = analysis.score || "";
  row.primary_need = (analysis.tags || []).join("、");
  row.latest_summary = analysis.summary || "";
  upsertByKey_(SHEETS.students, "student_id", row);
}

function appendRisk_(source, sourceName) {
  const analysis = source.analysis || {};
  appendObject_(SHEETS.risks, {
    signal_id: uuid_("risk"),
    timestamp: new Date(),
    student_id: source.studentId || "",
    student_name: source.studentName || "",
    advisor_email: source.advisorEmail || "",
    source: sourceName,
    category: (analysis.tags || []).join("、"),
    severity: analysis.level || "",
    evidence: analysis.summary || "",
    risk_score: analysis.score || "",
    status: analysis.level === "立即轉介" ? "需要立即處理" : "待追蹤",
    due_date: source.followUpDate || "",
    resolved_at: ""
  });
}

function appendObject_(sheetName, object) {
  const headers = HEADERS[sheetName];
  const sheet = getSheet_(sheetName, headers);
  const row = headers.map(function (header) {
    return object[header] === undefined || object[header] === null ? "" : object[header];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
}

function upsertByKey_(sheetName, keyHeader, object) {
  const headers = HEADERS[sheetName];
  const sheet = getSheet_(sheetName, headers);
  const keyIndex = headers.indexOf(keyHeader);
  if (keyIndex < 0) throw new Error("找不到 key 欄位：" + keyHeader);
  const keyValue = String(object[keyHeader] || "").trim();
  if (!keyValue) throw new Error("缺少必要識別資料：" + keyHeader);
  const values = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    : [];
  let targetRow = -1;
  values.forEach(function (row, index) {
    if (String(row[keyIndex]).trim() === keyValue) targetRow = index + 2;
  });
  const rowValues = headers.map(function (header) {
    return object[header] === undefined || object[header] === null ? "" : object[header];
  });
  if (targetRow > 0) sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowValues]);
}

function buildTeacherDashboard_() {
  const rows = readObjects_(SHEETS.checkins);
  const latest = {};
  rows.forEach(function (row) {
    const studentId = String(row.student_id || "");
    if (!studentId) return;
    if (!latest[studentId] || String(row.timestamp) > String(latest[studentId].timestamp)) {
      latest[studentId] = row;
    }
  });
  return Object.keys(latest).map(function (id) {
    const row = latest[id];
    return {
      studentId: row.student_id,
      studentName: row.student_name,
      email: row.email,
      college: row.college,
      department: row.department,
      year: row.year,
      courseName: row.course_name,
      level: row.risk_level || "穩定",
      score: Number(row.risk_score || 0),
      tags: String(row.tags || "").split("、").filter(Boolean),
      reasons: row.summary ? [row.summary] : [],
      recommendations: parseJson_(row.recommendations_json, []),
      summary: row.summary || "",
      followUpDate: row.follow_up_date || "",
      preferredSupport: row.preferred_support || "",
      createdAt: row.timestamp
    };
  }).sort(function (a, b) {
    return b.score - a.score;
  });
}

function buildStudentProfile_(studentId) {
  if (!studentId) return null;
  const students = readObjects_(SHEETS.students);
  return students.filter(function (row) {
    return String(row.student_id) === String(studentId);
  })[0] || null;
}

function readObjects_(sheetName) {
  const headers = HEADERS[sheetName];
  const sheet = getSheet_(sheetName, headers);
  if (sheet.getLastRow() <= 1) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(function (row) {
    const object = {};
    headers.forEach(function (header, index) {
      object[header] = row[index];
    });
    return object;
  });
}

function assertTeacher_(params) {
  assertAdmin_(params);
  return true;
}

function assertAdmin_(params) {
  const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_SHARED_SECRET");
  if (!expected) return true;
  const token = String(params.token || params.adminToken || "");
  if (token !== expected) throw new Error("教師端權限驗證未通過。");
  return true;
}

function audit_(email, role, action, ok, message) {
  try {
    appendObject_(SHEETS.audit, {
      timestamp: new Date(),
      actor_email: email || "",
      role: role || "",
      action: action || "",
      ok: ok ? "TRUE" : "FALSE",
      message: message || ""
    });
  } catch (err) {
    console.warn(err);
  }
}

function analyzeWithOpenAI_(input) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) return null;
  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-5.2";
  const payload = {
    model: model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "你是大學學習預警輔導系統的分析助手。只分析學習支持，不做醫療診斷。若出現自傷或立即危險訊號，level 必須是「立即轉介」。回傳繁體中文 JSON。" }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(input) }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "learning_support_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            level: { type: "string", enum: ["穩定", "觀察", "優先關懷", "立即轉介"] },
            score: { type: "number" },
            tags: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
            reasons: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } }
          },
          required: ["level", "score", "tags", "summary", "reasons", "recommendations"]
        }
      }
    },
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
  if (status >= 300) throw new Error(data.error && data.error.message ? data.error.message : "OpenAI 分析失敗");
  const text = extractOutputText_(data);
  return text ? JSON.parse(text) : null;
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

function uuid_(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "").slice(0, 18);
}
