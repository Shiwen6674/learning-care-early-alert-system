(function () {
  "use strict";

  const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw9A4n_9XskiPQidcaZLSbkweI1BXG_QMywC5BXnIUv_YIOVEyhu5VlYPid0yuxJtuZ/exec";
  const SETTINGS_KEY = "ndhu.learning.anan.settings.v2";
  const CONSENT_KEY = "ndhu.learning.anan.usageConsent.v5";
  const SESSION_COUNT_KEY = "ndhu.learning.anan.sessionCount.v1";
  const AUTH_STORE_KEY = "ndhu.learning.anan.students.v1";
  const CURRENT_USER_KEY = "ndhu.learning.anan.currentStudent.v1";
  const LANGUAGE_KEY = "ndhu.learning.anan.language.v1";
  const DAILY_TURN_KEY = "ndhu.learning.anan.dailyTurns.v1";
  const DAILY_TURN_LIMIT = 20;
  const LLM_TIMEOUT_MS = 90000;
  const IDLE_PROMPT_DELAYS = [180000, 60000, 60000];
  const IDLE_PROMPT_KEYS = ["idlePromptFirst", "idlePromptSecond", "idlePromptFinal"];
  const LIMIT_DIALOG_TEXT = "今天的對話次數已經用完了。若你現在很需要有人陪你一起處理，請先找導師、系辦、學務處或心理諮商輔導中心；若有立即安全疑慮，請直接聯繫校安或緊急求助。";
  const DEFAULT_SETTINGS = { gasEndpoint: GAS_ENDPOINT };
  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    messages: [],
    sessionNumber: 0,
    sessionId: "",
    reportAnalysis: "",
    students: [],
    authMode: "register",
    language: "zh",
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
  let idlePromptTimer = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const LANGUAGE_META = {
    zh: { html: "zh-Hant", locale: "zh-TW", speech: "zh-TW" },
    en: { html: "en", locale: "en-US", speech: "en-US" },
    ja: { html: "ja", locale: "ja-JP", speech: "ja-JP" },
    ms: { html: "ms", locale: "ms-MY", speech: "ms-MY" },
    th: { html: "th", locale: "th-TH", speech: "th-TH" },
    id: { html: "id", locale: "id-ID", speech: "id-ID" },
    vi: { html: "vi", locale: "vi-VN", speech: "vi-VN" }
  };

  const I18N = {
    zh: {
      brandTitle: "LCEAS 國立東華大學學習關懷預警系統",
      brandSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      languageLabel: "語言",
      entryTitle: "國立東華大學學習關懷預警系統",
      entryIntro: "安安是國立東華大學學習關懷預警系統的 AI 學習夥伴。你可以把課程進度、作業、考試準備、跨域修課或時間安排等學習上的困難或卡點，用自己的話說出來；安安會先試圖理解情況，再協助你釐清與改善你遇到的學習問題。",
      register: "註冊",
      login: "登入",
      authTitleRegister: "學生註冊",
      authTitleLogin: "學生登入",
      authHintRegister: "第一次使用請建立學生帳號，安安會用這些資訊理解你的學院、系所與學習脈絡；之後請用同一個 email 登入。",
      authHintLogin: "請用註冊時的 email 與密碼登入。",
      nickname: "姓名或稱呼",
      email: "Email",
      password: "密碼",
      confirmPassword: "確認密碼",
      grade: "年級",
      studentId: "學號",
      college: "學院",
      department: "系所",
      nicknamePlaceholder: "輸入你希望安安使用的稱呼",
      emailPlaceholder: "輸入學校或常用 email",
      passwordPlaceholder: "至少 8 個字元",
      confirmPasswordPlaceholder: "再次輸入密碼",
      studentIdPlaceholder: "輸入學號",
      submitRegister: "完成註冊並和安安聊聊",
      submitLogin: "登入並和安安聊聊",
      backToEntry: "返回登入頁",
      clearChat: "清除對話",
      downloadTxt: "下載 TXT",
      downloadPdf: "下載 PDF",
      chatInput: "{name}，輸入你想和安安說的話...",
      voiceInput: "語音輸入",
      stopVoiceInput: "停止語音輸入",
      send: "送出",
      noConversation: "目前還沒有可下載的對話。",
      thinking: "思考中...",
      pdfPreparing: "正在整理 PDF。",
      popupBlocked: "瀏覽器阻擋了 PDF 視窗，請允許彈出視窗後再試。",
      enterEmail: "請先輸入 email。",
      passwordShort: "密碼至少需要 8 個字元。",
      emailNotFound: "這個 email 尚未註冊，請先建立學生帳號。",
      wrongPassword: "密碼不正確，請再試一次。",
      passwordMismatch: "兩次輸入的密碼不一致。",
      emailRegistered: "這個 email 已註冊，請改用登入。",
      loginSuccess: "已登入，可以開始和安安聊聊。",
      registerSuccess: "註冊完成，可以開始和安安聊聊。",
      loginFirst: "請先用 email 登入或註冊。",
      firstGreeting: (name) => `Hi，${name}你好，我是安安，今天有什麼學習困難或是心裡話想跟我聊聊呢？`,
      returningGreeting: (name, topic) => `Hi，${name}你好，我是安安，很開心你今天再回來找我，有什麼學習困難或是心裡話想跟我聊聊？或是${topic ? `上次「${topic}」` : "上次聊到"}的事情也可以哦～！`,
      idlePromptFirst: "你還好嗎？ 有什麼話想繼續跟我分享呢？",
      idlePromptSecond: "看你沒回應，有什麼是安安可以幫你的呢？",
      idlePromptFinal: "你可能在忙碌中，我就先不打擾你。如果有需要安安，歡迎隨時回來找我唷！",
      speechUnsupported: "這個瀏覽器目前不支援語音輸入。",
      speechUnavailable: "語音輸入暫時無法使用。",
      speechPreparing: "語音輸入正在準備中。",
      limitDialog: "同學您好，您的問題可以進一步洽詢學校導師、行政人員或心理諮商中心，相信可以獲得更好的協助。",
      limitOk: "我知道了",
      unknown: "未填寫",
      you: "你",
      student: "同學",
      anan: "安安",
      reportSystemTitle: "國立東華大學學習關懷預警系統",
      reportSystemSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      reportSession: (count) => `第${count}次對話紀錄`,
      reportDate: "日期",
      reportName: "姓名",
      reportEmail: "Email",
      reportStudentId: "學號",
      reportGrade: "年級",
      reportCollege: "學院",
      reportDepartment: "科系",
      reportGenerated: "產生時間",
      reportCoverBackTitle: "學習關懷紀錄",
      reportCoverBackText: "這一頁作為封面底頁，保留給列印與裝訂時使用。",
      reportAnalysisLabel: "Learning Care Summary",
      reportAnalysisTitle: "綜合分析",
      reportTranscriptLabel: "Conversation Transcript",
      reportTranscriptTitle: "詳細對話過程",
      reportBackCoverText: "謝謝你願意與安安分享心裡的話，讓我陪你一起往前走！",
      txtSummaryTitle: "綜合分析",
      txtTranscriptTitle: "詳細對話過程"
    },
    en: {
      brandTitle: "LCEAS National Dong Hwa University Learning Care Early Alert System",
      brandSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      languageLabel: "Language",
      entryTitle: "National Dong Hwa University Learning Care Early Alert System",
      entryIntro: "Anan is the AI learning companion in NDHU's Learning Care Early Alert System. You can describe course progress, assignments, exam preparation, interdisciplinary learning, time planning, or other learning difficulties in your own words; Anan will first understand your situation, then help you clarify and improve the learning issue you are facing.",
      register: "Register",
      login: "Log in",
      authTitleRegister: "Student Registration",
      authTitleLogin: "Student Login",
      authHintRegister: "Create your student account first. Anan uses this information to understand your college, department, and learning context. Please use the same email next time.",
      authHintLogin: "Log in with the email and password you used when registering.",
      nickname: "Name or preferred name",
      email: "Email",
      password: "Password",
      confirmPassword: "Confirm password",
      grade: "Year",
      studentId: "Student ID",
      college: "College",
      department: "Department",
      nicknamePlaceholder: "How should Anan call you?",
      emailPlaceholder: "Enter your school or usual email",
      passwordPlaceholder: "At least 8 characters",
      confirmPasswordPlaceholder: "Enter the password again",
      studentIdPlaceholder: "Enter student ID",
      submitRegister: "Register and chat with Anan",
      submitLogin: "Log in and chat with Anan",
      backToEntry: "Back to login",
      clearChat: "Clear chat",
      downloadTxt: "Download TXT",
      downloadPdf: "Download PDF",
      chatInput: "{name}, type what you want to tell Anan...",
      voiceInput: "Voice input",
      stopVoiceInput: "Stop voice input",
      send: "Send",
      noConversation: "There is no conversation to download yet.",
      thinking: "Thinking...",
      pdfPreparing: "Preparing the PDF.",
      popupBlocked: "The browser blocked the PDF window. Please allow pop-ups and try again.",
      enterEmail: "Please enter your email first.",
      passwordShort: "The password must contain at least 8 characters.",
      emailNotFound: "This email has not been registered yet. Please create a student account first.",
      wrongPassword: "The password is incorrect. Please try again.",
      passwordMismatch: "The two passwords do not match.",
      emailRegistered: "This email is already registered. Please log in instead.",
      loginSuccess: "You are logged in and can start chatting with Anan.",
      registerSuccess: "Registration complete. You can start chatting with Anan.",
      loginFirst: "Please log in or register with email first.",
      firstGreeting: (name) => `Hi ${name}, I am Anan. What learning difficulty or honest thought would you like to talk about today?`,
      returningGreeting: (name, topic) => `Hi ${name}, I am Anan. I am glad you came back today. What learning difficulty or honest thought would you like to talk about? We can also continue from ${topic ? `what you mentioned last time: "${topic}"` : "what we talked about last time"}.`,
      idlePromptFirst: "Are you doing okay? Is there anything you would like to keep sharing with me?",
      idlePromptSecond: "I have not heard from you yet. Is there anything Anan can help with?",
      idlePromptFinal: "You may be busy, so I will give you some space. Whenever you need Anan, you are welcome to come back.",
      speechUnsupported: "This browser does not support voice input yet.",
      speechUnavailable: "Voice input is temporarily unavailable.",
      speechPreparing: "Voice input is getting ready.",
      limitDialog: "Your concern may benefit from support from your advisor, department office, student affairs staff, or counseling center.",
      limitOk: "I understand",
      unknown: "Not provided",
      you: "You",
      student: "Student",
      anan: "Anan",
      reportSystemTitle: "National Dong Hwa University Learning Care Early Alert System",
      reportSystemSubtitle: "LCEAS",
      reportSession: (count) => `Conversation Record ${count}`,
      reportDate: "Date",
      reportName: "Name",
      reportEmail: "Email",
      reportStudentId: "Student ID",
      reportGrade: "Year",
      reportCollege: "College",
      reportDepartment: "Department",
      reportGenerated: "Generated at",
      reportCoverBackTitle: "Learning Care Record",
      reportCoverBackText: "This page is reserved as the inside cover for printing and binding.",
      reportAnalysisLabel: "Learning Care Summary",
      reportAnalysisTitle: "Comprehensive Analysis",
      reportTranscriptLabel: "Conversation Transcript",
      reportTranscriptTitle: "Detailed Conversation",
      reportBackCoverText: "Thank you for putting your learning difficulties into words. May this record help you see the next step more clearly.",
      txtSummaryTitle: "Comprehensive Analysis",
      txtTranscriptTitle: "Detailed Conversation"
    },
    ja: {
      brandTitle: "LCEAS 国立東華大学 学習ケア早期アラートシステム",
      brandSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      languageLabel: "言語",
      entryTitle: "国立東華大学 学習ケア早期アラートシステム",
      entryIntro: "安安は、国立東華大学の学習ケア早期アラートシステムにいる AI 学習パートナーです。授業の進度、課題、試験準備、学際的な履修、時間管理など、学習で困っていることを自分の言葉で話せます。安安はまず状況を理解し、学習上の問題を整理して改善の方向を一緒に考えます。",
      register: "登録",
      login: "ログイン",
      authTitleRegister: "学生登録",
      authTitleLogin: "学生ログイン",
      authHintRegister: "初回は学生アカウントを作成してください。安安は学部・学科と学習背景を理解するためにこの情報を使います。次回以降は同じメールでログインしてください。",
      authHintLogin: "登録したメールとパスワードでログインしてください。",
      nickname: "名前または呼び名",
      email: "Email",
      password: "パスワード",
      confirmPassword: "パスワード確認",
      grade: "学年",
      studentId: "学籍番号",
      college: "学部",
      department: "学科",
      nicknamePlaceholder: "安安に呼んでほしい名前",
      emailPlaceholder: "学校または普段使うメール",
      passwordPlaceholder: "8文字以上",
      confirmPasswordPlaceholder: "もう一度入力",
      studentIdPlaceholder: "学籍番号を入力",
      submitRegister: "登録して安安と話す",
      submitLogin: "ログインして安安と話す",
      backToEntry: "ログインへ戻る",
      clearChat: "会話を消去",
      downloadTxt: "TXTを保存",
      downloadPdf: "PDFを保存",
      chatInput: "{name}さん、安安に話したいことを入力してください...",
      voiceInput: "音声入力",
      stopVoiceInput: "音声入力を停止",
      send: "送信",
      noConversation: "ダウンロードできる会話はまだありません。",
      thinking: "考えています...",
      pdfPreparing: "PDFを準備しています。",
      popupBlocked: "PDFウィンドウがブロックされました。ポップアップを許可して再試行してください。",
      enterEmail: "メールを入力してください。",
      passwordShort: "パスワードは8文字以上必要です。",
      emailNotFound: "このメールは未登録です。先に学生アカウントを作成してください。",
      wrongPassword: "パスワードが正しくありません。",
      passwordMismatch: "2つのパスワードが一致しません。",
      emailRegistered: "このメールはすでに登録されています。ログインしてください。",
      loginSuccess: "ログインしました。安安と話せます。",
      registerSuccess: "登録が完了しました。安安と話せます。",
      loginFirst: "先にメールでログインまたは登録してください。",
      firstGreeting: (name) => `Hi、${name}さん、安安です。今日は学習で困っていることや、心の中で話したいことがありますか？`,
      returningGreeting: (name, topic) => `Hi、${name}さん、安安です。今日また来てくれてうれしいです。学習の困りごとでも、心の中のことでも話して大丈夫です。${topic ? `前回の「${topic}」` : "前回話したこと"}の続きでもいいですよ～！`,
      idlePromptFirst: "大丈夫ですか？ 続けて話したいことがあれば、聞かせてください。",
      idlePromptSecond: "まだ返事がないみたいです。安安に手伝えることはありますか？",
      idlePromptFinal: "今は忙しいのかもしれませんね。いったん静かにしています。必要になったら、いつでも戻ってきてください。",
      speechUnsupported: "このブラウザは音声入力に対応していません。",
      speechUnavailable: "音声入力は一時的に利用できません。",
      speechPreparing: "音声入力を準備しています。",
      limitDialog: "この内容は、指導教員、学科事務、学生支援、またはカウンセリングセンターに相談すると、より具体的な支援につながります。",
      limitOk: "わかりました",
      unknown: "未入力",
      you: "あなた",
      student: "学生",
      anan: "安安",
      reportSystemTitle: "国立東華大学 学習ケア早期アラートシステム",
      reportSystemSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      reportSession: (count) => `第${count}回 対話記録`,
      reportDate: "日付",
      reportName: "氏名",
      reportEmail: "Email",
      reportStudentId: "学籍番号",
      reportGrade: "学年",
      reportCollege: "学部",
      reportDepartment: "学科",
      reportGenerated: "作成日時",
      reportCoverBackTitle: "学習ケア記録",
      reportCoverBackText: "このページは印刷・製本用の表紙裏として残しています。",
      reportAnalysisLabel: "Learning Care Summary",
      reportAnalysisTitle: "総合分析",
      reportTranscriptLabel: "Conversation Transcript",
      reportTranscriptTitle: "詳細な対話記録",
      reportBackCoverText: "学習の困りごとを言葉にしてくれてありがとうございます。この記録が次の一歩を見つける助けになりますように。",
      txtSummaryTitle: "総合分析",
      txtTranscriptTitle: "詳細な対話記録"
    },
    ms: {
      brandTitle: "LCEAS Sistem Amaran Awal Penjagaan Pembelajaran NDHU",
      brandSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      languageLabel: "Bahasa",
      entryTitle: "Sistem Amaran Awal Penjagaan Pembelajaran NDHU",
      entryIntro: "Anan ialah rakan pembelajaran AI dalam Sistem Amaran Awal Penjagaan Pembelajaran NDHU. Anda boleh menerangkan kemajuan kursus, tugasan, persediaan peperiksaan, pembelajaran rentas bidang, pengurusan masa atau kesukaran pembelajaran dengan kata-kata sendiri; Anan akan cuba memahami keadaan anda dahulu, kemudian membantu menjelaskan dan memperbaiki masalah pembelajaran yang dihadapi.",
      register: "Daftar",
      login: "Log masuk",
      authTitleRegister: "Pendaftaran Pelajar",
      authTitleLogin: "Log Masuk Pelajar",
      authHintRegister: "Bina akaun pelajar terlebih dahulu. Anan menggunakan maklumat ini untuk memahami kolej, jabatan dan konteks pembelajaran anda. Gunakan emel yang sama pada masa akan datang.",
      authHintLogin: "Log masuk dengan emel dan kata laluan semasa pendaftaran.",
      nickname: "Nama atau panggilan",
      email: "Email",
      password: "Kata laluan",
      confirmPassword: "Sahkan kata laluan",
      grade: "Tahun",
      studentId: "ID pelajar",
      college: "Kolej",
      department: "Jabatan",
      nicknamePlaceholder: "Nama yang Anan patut gunakan",
      emailPlaceholder: "Masukkan emel sekolah atau emel biasa",
      passwordPlaceholder: "Sekurang-kurangnya 8 aksara",
      confirmPasswordPlaceholder: "Masukkan semula kata laluan",
      studentIdPlaceholder: "Masukkan ID pelajar",
      submitRegister: "Daftar dan berbual dengan Anan",
      submitLogin: "Log masuk dan berbual dengan Anan",
      backToEntry: "Kembali ke log masuk",
      clearChat: "Padam perbualan",
      downloadTxt: "Muat turun TXT",
      downloadPdf: "Muat turun PDF",
      chatInput: "{name}, taip perkara yang ingin anda beritahu Anan...",
      voiceInput: "Input suara",
      stopVoiceInput: "Hentikan input suara",
      send: "Hantar",
      noConversation: "Belum ada perbualan untuk dimuat turun.",
      thinking: "Sedang berfikir...",
      pdfPreparing: "Sedang menyediakan PDF.",
      popupBlocked: "Tetingkap PDF disekat oleh pelayar. Benarkan pop-up dan cuba lagi.",
      enterEmail: "Sila masukkan emel dahulu.",
      passwordShort: "Kata laluan mesti sekurang-kurangnya 8 aksara.",
      emailNotFound: "Emel ini belum didaftarkan. Sila bina akaun pelajar dahulu.",
      wrongPassword: "Kata laluan tidak betul. Sila cuba lagi.",
      passwordMismatch: "Kedua-dua kata laluan tidak sepadan.",
      emailRegistered: "Emel ini telah didaftarkan. Sila log masuk.",
      loginSuccess: "Anda telah log masuk dan boleh mula berbual dengan Anan.",
      registerSuccess: "Pendaftaran selesai. Anda boleh mula berbual dengan Anan.",
      loginFirst: "Sila log masuk atau daftar dengan emel dahulu.",
      firstGreeting: (name) => `Hi ${name}, saya Anan. Hari ini ada kesukaran belajar atau perkara di hati yang ingin anda bualkan?`,
      returningGreeting: (name, topic) => `Hi ${name}, saya Anan. Gembira anda kembali hari ini. Ada kesukaran belajar atau perkara di hati yang ingin dibualkan? Kita juga boleh sambung tentang ${topic ? `"${topic}" dari kali lepas` : "perkara yang dibualkan kali lepas"}.`,
      idlePromptFirst: "Anda okey? Ada apa-apa yang ingin terus dikongsi dengan saya?",
      idlePromptSecond: "Saya belum nampak balasan anda. Ada apa-apa yang Anan boleh bantu?",
      idlePromptFinal: "Mungkin anda sedang sibuk, jadi saya berhenti mengganggu dahulu. Jika perlukan Anan, anda boleh kembali bila-bila masa.",
      speechUnsupported: "Pelayar ini belum menyokong input suara.",
      speechUnavailable: "Input suara tidak tersedia buat sementara.",
      speechPreparing: "Input suara sedang disediakan.",
      limitDialog: "Isu ini mungkin lebih sesuai dibincangkan dengan penasihat, pejabat jabatan, hal ehwal pelajar atau pusat kaunseling.",
      limitOk: "Saya faham",
      unknown: "Tidak dinyatakan",
      you: "Anda",
      student: "Pelajar",
      anan: "Anan",
      reportSystemTitle: "Sistem Amaran Awal Penjagaan Pembelajaran NDHU",
      reportSystemSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      reportSession: (count) => `Rekod Perbualan Kali Ke-${count}`,
      reportDate: "Tarikh",
      reportName: "Nama",
      reportEmail: "Email",
      reportStudentId: "ID pelajar",
      reportGrade: "Tahun",
      reportCollege: "Kolej",
      reportDepartment: "Jabatan",
      reportGenerated: "Dijana pada",
      reportCoverBackTitle: "Rekod Penjagaan Pembelajaran",
      reportCoverBackText: "Halaman ini disediakan sebagai bahagian dalam muka depan untuk cetakan dan penjilidan.",
      reportAnalysisLabel: "Learning Care Summary",
      reportAnalysisTitle: "Analisis Menyeluruh",
      reportTranscriptLabel: "Conversation Transcript",
      reportTranscriptTitle: "Butiran Perbualan",
      reportBackCoverText: "Terima kasih kerana menyuarakan kesukaran pembelajaran anda. Semoga rekod ini membantu anda melihat langkah seterusnya dengan lebih jelas.",
      txtSummaryTitle: "Analisis Menyeluruh",
      txtTranscriptTitle: "Butiran Perbualan"
    },
    th: {
      brandTitle: "LCEAS ระบบดูแลการเรียนรู้และแจ้งเตือนล่วงหน้า NDHU",
      brandSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      languageLabel: "ภาษา",
      entryTitle: "ระบบดูแลการเรียนรู้และแจ้งเตือนล่วงหน้า NDHU",
      entryIntro: "Anan คือเพื่อน AI ด้านการเรียนรู้ในระบบ Learning Care Early Alert System ของ NDHU คุณสามารถเล่าเรื่องความคืบหน้าวิชา งานที่ต้องส่ง การเตรียมสอบ การเรียนข้ามสาขา การจัดเวลา หรือปัญหาการเรียนด้วยคำพูดของคุณเอง Anan จะทำความเข้าใจสถานการณ์ก่อน แล้วช่วยคุณจัดระเบียบและหาทางปรับปรุงปัญหาการเรียนที่กำลังเจอ",
      register: "สมัคร",
      login: "เข้าสู่ระบบ",
      authTitleRegister: "สมัครบัญชีนักศึกษา",
      authTitleLogin: "เข้าสู่ระบบนักศึกษา",
      authHintRegister: "สร้างบัญชีนักศึกษาก่อน Anan จะใช้ข้อมูลนี้เพื่อเข้าใจวิทยาลัย ภาควิชา และบริบทการเรียนของคุณ ครั้งต่อไปโปรดใช้อีเมลเดิมเข้าสู่ระบบ",
      authHintLogin: "เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ใช้สมัคร",
      nickname: "ชื่อหรือชื่อที่อยากให้เรียก",
      email: "Email",
      password: "รหัสผ่าน",
      confirmPassword: "ยืนยันรหัสผ่าน",
      grade: "ชั้นปี",
      studentId: "รหัสนักศึกษา",
      college: "วิทยาลัย",
      department: "ภาควิชา",
      nicknamePlaceholder: "อยากให้ Anan เรียกคุณว่าอะไร",
      emailPlaceholder: "ใส่อีเมลมหาวิทยาลัยหรืออีเมลที่ใช้ประจำ",
      passwordPlaceholder: "อย่างน้อย 8 ตัวอักษร",
      confirmPasswordPlaceholder: "ใส่รหัสผ่านอีกครั้ง",
      studentIdPlaceholder: "ใส่รหัสนักศึกษา",
      submitRegister: "สมัครและคุยกับ Anan",
      submitLogin: "เข้าสู่ระบบและคุยกับ Anan",
      backToEntry: "กลับไปหน้าเข้าสู่ระบบ",
      clearChat: "ล้างบทสนทนา",
      downloadTxt: "ดาวน์โหลด TXT",
      downloadPdf: "ดาวน์โหลด PDF",
      chatInput: "{name}, พิมพ์สิ่งที่อยากบอก Anan...",
      voiceInput: "ป้อนด้วยเสียง",
      stopVoiceInput: "หยุดป้อนด้วยเสียง",
      send: "ส่ง",
      noConversation: "ยังไม่มีบทสนทนาสำหรับดาวน์โหลด",
      thinking: "กำลังคิด...",
      pdfPreparing: "กำลังเตรียม PDF",
      popupBlocked: "เบราว์เซอร์บล็อกหน้าต่าง PDF โปรดอนุญาต pop-up แล้วลองอีกครั้ง",
      enterEmail: "กรุณาใส่อีเมลก่อน",
      passwordShort: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
      emailNotFound: "อีเมลนี้ยังไม่ได้สมัคร โปรดสร้างบัญชีนักศึกษาก่อน",
      wrongPassword: "รหัสผ่านไม่ถูกต้อง โปรดลองอีกครั้ง",
      passwordMismatch: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
      emailRegistered: "อีเมลนี้สมัครแล้ว โปรดเข้าสู่ระบบ",
      loginSuccess: "เข้าสู่ระบบแล้ว คุณสามารถเริ่มคุยกับ Anan ได้",
      registerSuccess: "สมัครเสร็จแล้ว คุณสามารถเริ่มคุยกับ Anan ได้",
      loginFirst: "กรุณาเข้าสู่ระบบหรือสมัครด้วยอีเมลก่อน",
      firstGreeting: (name) => `Hi ${name} ฉันคือ Anan วันนี้มีเรื่องเรียนติดขัด หรือเรื่องในใจที่อยากคุยไหม?`,
      returningGreeting: (name, topic) => `Hi ${name} ฉันคือ Anan ดีใจที่วันนี้กลับมาหากันอีก มีเรื่องเรียนติดขัดหรือเรื่องในใจที่อยากคุยไหม? หรือจะคุยต่อจาก${topic ? `เรื่อง "${topic}" ครั้งก่อน` : "เรื่องครั้งก่อน"}ก็ได้นะ～`,
      idlePromptFirst: "คุณยังโอเคไหม? มีอะไรอยากเล่าต่อให้ฉันฟังไหม?",
      idlePromptSecond: "เห็นว่ายังไม่ได้ตอบ มีอะไรที่ Anan ช่วยได้ไหม?",
      idlePromptFinal: "คุณอาจกำลังยุ่งอยู่ ฉันจะไม่รบกวนก่อนนะ ถ้าต้องการ Anan กลับมาได้เสมอ",
      speechUnsupported: "เบราว์เซอร์นี้ยังไม่รองรับการป้อนด้วยเสียง",
      speechUnavailable: "การป้อนด้วยเสียงยังใช้ไม่ได้ชั่วคราว",
      speechPreparing: "กำลังเตรียมการป้อนด้วยเสียง",
      limitDialog: "เรื่องนี้อาจได้รับความช่วยเหลือที่เหมาะขึ้นจากอาจารย์ที่ปรึกษา สำนักงานภาควิชา งานกิจการนักศึกษา หรือศูนย์ให้คำปรึกษา",
      limitOk: "เข้าใจแล้ว",
      unknown: "ไม่ได้ระบุ",
      you: "คุณ",
      student: "นักศึกษา",
      anan: "Anan",
      reportSystemTitle: "ระบบดูแลการเรียนรู้และแจ้งเตือนล่วงหน้า NDHU",
      reportSystemSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      reportSession: (count) => `บันทึกการสนทนาครั้งที่ ${count}`,
      reportDate: "วันที่",
      reportName: "ชื่อ",
      reportEmail: "Email",
      reportStudentId: "รหัสนักศึกษา",
      reportGrade: "ชั้นปี",
      reportCollege: "วิทยาลัย",
      reportDepartment: "ภาควิชา",
      reportGenerated: "สร้างเมื่อ",
      reportCoverBackTitle: "บันทึกการดูแลการเรียนรู้",
      reportCoverBackText: "หน้านี้เว้นไว้เป็นด้านในของปกสำหรับการพิมพ์และเข้าเล่ม",
      reportAnalysisLabel: "Learning Care Summary",
      reportAnalysisTitle: "การวิเคราะห์โดยรวม",
      reportTranscriptLabel: "Conversation Transcript",
      reportTranscriptTitle: "รายละเอียดบทสนทนา",
      reportBackCoverText: "ขอบคุณที่เล่าความยากในการเรียนออกมา หวังว่าบันทึกนี้จะช่วยให้เห็นก้าวต่อไปชัดขึ้น",
      txtSummaryTitle: "การวิเคราะห์โดยรวม",
      txtTranscriptTitle: "รายละเอียดบทสนทนา"
    },
    id: {
      brandTitle: "LCEAS Sistem Peringatan Dini Kepedulian Belajar NDHU",
      brandSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      languageLabel: "Bahasa",
      entryTitle: "Sistem Peringatan Dini Kepedulian Belajar NDHU",
      entryIntro: "Anan adalah pendamping belajar AI dalam Learning Care Early Alert System NDHU. Anda dapat menceritakan kemajuan mata kuliah, tugas, persiapan ujian, kuliah lintas bidang, pengaturan waktu, atau kesulitan belajar dengan kata-kata sendiri; Anan akan memahami situasi Anda terlebih dahulu, lalu membantu memperjelas dan memperbaiki masalah belajar yang sedang dihadapi.",
      register: "Daftar",
      login: "Masuk",
      authTitleRegister: "Pendaftaran Mahasiswa",
      authTitleLogin: "Masuk Mahasiswa",
      authHintRegister: "Buat akun mahasiswa terlebih dahulu. Anan menggunakan informasi ini untuk memahami fakultas, jurusan, dan konteks belajar Anda. Gunakan email yang sama di lain waktu.",
      authHintLogin: "Masuk dengan email dan kata sandi yang digunakan saat mendaftar.",
      nickname: "Nama atau panggilan",
      email: "Email",
      password: "Kata sandi",
      confirmPassword: "Konfirmasi kata sandi",
      grade: "Tingkat",
      studentId: "NIM",
      college: "Fakultas",
      department: "Jurusan",
      nicknamePlaceholder: "Anan sebaiknya memanggil Anda apa?",
      emailPlaceholder: "Masukkan email kampus atau email biasa",
      passwordPlaceholder: "Minimal 8 karakter",
      confirmPasswordPlaceholder: "Masukkan kata sandi lagi",
      studentIdPlaceholder: "Masukkan NIM",
      submitRegister: "Daftar dan berbicara dengan Anan",
      submitLogin: "Masuk dan berbicara dengan Anan",
      backToEntry: "Kembali ke login",
      clearChat: "Hapus percakapan",
      downloadTxt: "Unduh TXT",
      downloadPdf: "Unduh PDF",
      chatInput: "{name}, ketik hal yang ingin Anda sampaikan kepada Anan...",
      voiceInput: "Input suara",
      stopVoiceInput: "Hentikan input suara",
      send: "Kirim",
      noConversation: "Belum ada percakapan untuk diunduh.",
      thinking: "Sedang berpikir...",
      pdfPreparing: "Menyiapkan PDF.",
      popupBlocked: "Jendela PDF diblokir browser. Izinkan pop-up dan coba lagi.",
      enterEmail: "Silakan masukkan email terlebih dahulu.",
      passwordShort: "Kata sandi harus minimal 8 karakter.",
      emailNotFound: "Email ini belum terdaftar. Silakan buat akun mahasiswa terlebih dahulu.",
      wrongPassword: "Kata sandi salah. Silakan coba lagi.",
      passwordMismatch: "Kedua kata sandi tidak cocok.",
      emailRegistered: "Email ini sudah terdaftar. Silakan masuk.",
      loginSuccess: "Anda sudah masuk dan dapat mulai berbicara dengan Anan.",
      registerSuccess: "Pendaftaran selesai. Anda dapat mulai berbicara dengan Anan.",
      loginFirst: "Silakan masuk atau daftar dengan email terlebih dahulu.",
      firstGreeting: (name) => `Hi ${name}, saya Anan. Hari ini ada kesulitan belajar atau isi hati yang ingin kamu ceritakan?`,
      returningGreeting: (name, topic) => `Hi ${name}, saya Anan. Senang kamu kembali hari ini. Ada kesulitan belajar atau isi hati yang ingin kamu ceritakan? Kita juga bisa lanjut dari ${topic ? `hal "${topic}" yang kamu ceritakan sebelumnya` : "obrolan sebelumnya"}.`,
      idlePromptFirst: "Kamu baik-baik saja? Ada hal yang ingin kamu lanjutkan untuk dibagikan?",
      idlePromptSecond: "Aku belum melihat balasanmu. Ada yang bisa Anan bantu?",
      idlePromptFinal: "Mungkin kamu sedang sibuk, jadi aku tidak mengganggu dulu. Kalau butuh Anan, kamu bisa kembali kapan saja.",
      speechUnsupported: "Browser ini belum mendukung input suara.",
      speechUnavailable: "Input suara sementara tidak tersedia.",
      speechPreparing: "Input suara sedang disiapkan.",
      limitDialog: "Hal ini mungkin lebih baik didiskusikan dengan dosen pembimbing, kantor jurusan, bagian kemahasiswaan, atau pusat konseling.",
      limitOk: "Saya mengerti",
      unknown: "Belum diisi",
      you: "Anda",
      student: "Mahasiswa",
      anan: "Anan",
      reportSystemTitle: "Sistem Peringatan Dini Kepedulian Belajar NDHU",
      reportSystemSubtitle: "National Dong Hwa University Learning Care Early Alert System",
      reportSession: (count) => `Catatan Percakapan Ke-${count}`,
      reportDate: "Tanggal",
      reportName: "Nama",
      reportEmail: "Email",
      reportStudentId: "NIM",
      reportGrade: "Tingkat",
      reportCollege: "Fakultas",
      reportDepartment: "Jurusan",
      reportGenerated: "Dibuat pada",
      reportCoverBackTitle: "Catatan Kepedulian Belajar",
      reportCoverBackText: "Halaman ini disediakan sebagai sisi dalam sampul untuk pencetakan dan penjilidan.",
      reportAnalysisLabel: "Learning Care Summary",
      reportAnalysisTitle: "Analisis Menyeluruh",
      reportTranscriptLabel: "Conversation Transcript",
      reportTranscriptTitle: "Detail Percakapan",
      reportBackCoverText: "Terima kasih telah menyampaikan kesulitan belajar Anda. Semoga catatan ini membantu Anda melihat langkah berikutnya dengan lebih jelas.",
      txtSummaryTitle: "Analisis Menyeluruh",
      txtTranscriptTitle: "Detail Percakapan"
    }
  };

  I18N.vi = Object.assign({}, I18N.en, {
    brandTitle: "LCEAS Hệ thống cảnh báo sớm và chăm sóc học tập Đại học Quốc lập Đông Hoa",
    languageLabel: "Ngôn ngữ",
    entryTitle: "Hệ thống cảnh báo sớm và chăm sóc học tập Đại học Quốc lập Đông Hoa",
    entryIntro: "Anan là người bạn học tập AI trong Hệ thống cảnh báo sớm và chăm sóc học tập của Đại học Quốc lập Đông Hoa. Bạn có thể kể bằng lời của mình về tiến độ môn học, bài tập, chuẩn bị thi, học liên ngành, sắp xếp thời gian hoặc những điểm đang gặp khó khăn; Anan sẽ trước hết hiểu tình huống của bạn, rồi hỗ trợ làm rõ và cải thiện vấn đề học tập bạn đang gặp.",
    register: "Đăng ký",
    login: "Đăng nhập",
    authTitleRegister: "Đăng ký sinh viên",
    authTitleLogin: "Đăng nhập sinh viên",
    authHintRegister: "Lần đầu sử dụng, hãy tạo tài khoản sinh viên. Anan dùng thông tin này để hiểu học viện, khoa và bối cảnh học tập của bạn. Lần sau vui lòng dùng cùng email để đăng nhập.",
    authHintLogin: "Vui lòng đăng nhập bằng email và mật khẩu đã dùng khi đăng ký.",
    nickname: "Tên hoặc cách xưng hô",
    password: "Mật khẩu",
    confirmPassword: "Xác nhận mật khẩu",
    grade: "Năm học",
    studentId: "Mã số sinh viên",
    college: "Học viện",
    department: "Khoa",
    nicknamePlaceholder: "Bạn muốn Anan gọi bạn là gì?",
    emailPlaceholder: "Nhập email trường hoặc email thường dùng",
    passwordPlaceholder: "Ít nhất 8 ký tự",
    confirmPasswordPlaceholder: "Nhập lại mật khẩu",
    studentIdPlaceholder: "Nhập mã số sinh viên",
    submitRegister: "Đăng ký và trò chuyện với Anan",
    submitLogin: "Đăng nhập và trò chuyện với Anan",
    backToEntry: "Quay lại trang đăng nhập",
    clearChat: "Xóa đối thoại",
    downloadTxt: "Tải TXT",
    downloadPdf: "Tải PDF",
    chatInput: "{name}, nhập điều bạn muốn nói với Anan...",
    voiceInput: "Nhập bằng giọng nói",
    stopVoiceInput: "Dừng nhập giọng nói",
    send: "Gửi",
    noConversation: "Chưa có cuộc trò chuyện để tải xuống.",
    thinking: "Đang suy nghĩ...",
    pdfPreparing: "Đang chuẩn bị PDF.",
    popupBlocked: "Trình duyệt đã chặn cửa sổ PDF. Vui lòng cho phép cửa sổ bật lên rồi thử lại.",
    enterEmail: "Vui lòng nhập email trước.",
    passwordShort: "Mật khẩu cần ít nhất 8 ký tự.",
    emailNotFound: "Email này chưa được đăng ký. Vui lòng tạo tài khoản sinh viên trước.",
    wrongPassword: "Mật khẩu không đúng, vui lòng thử lại.",
    passwordMismatch: "Hai lần nhập mật khẩu không khớp.",
    emailRegistered: "Email này đã được đăng ký, vui lòng đăng nhập.",
    loginSuccess: "Bạn đã đăng nhập và có thể bắt đầu trò chuyện với Anan.",
    registerSuccess: "Đăng ký hoàn tất. Bạn có thể bắt đầu trò chuyện với Anan.",
    loginFirst: "Vui lòng đăng nhập hoặc đăng ký bằng email trước.",
    firstGreeting: (name) => `Hi ${name}, mình là Anan. Hôm nay bạn có khó khăn học tập hoặc điều gì trong lòng muốn trò chuyện không?`,
    returningGreeting: (name, topic) => `Hi ${name}, mình là Anan. Rất vui vì hôm nay bạn quay lại. Bạn muốn nói về khó khăn học tập hay điều gì trong lòng? Mình cũng có thể cùng bạn tiếp tục chuyện ${topic ? `"${topic}" lần trước` : "lần trước"} nhé～`,
    idlePromptFirst: "Bạn vẫn ổn chứ? Có điều gì muốn tiếp tục chia sẻ với mình không?",
    idlePromptSecond: "Mình chưa thấy bạn trả lời. Có điều gì Anan có thể giúp không?",
    idlePromptFinal: "Có thể bạn đang bận, nên mình sẽ tạm không làm phiền. Khi nào cần Anan, bạn cứ quay lại nhé!",
    speechUnsupported: "Trình duyệt này hiện chưa hỗ trợ nhập bằng giọng nói.",
    speechUnavailable: "Tạm thời không thể sử dụng nhập bằng giọng nói.",
    speechPreparing: "Đang chuẩn bị nhập bằng giọng nói.",
    limitDialog: "Vấn đề của bạn có thể được hỗ trợ tốt hơn khi trao đổi thêm với cố vấn học tập, văn phòng khoa, đơn vị sinh viên hoặc trung tâm tư vấn.",
    limitOk: "Tôi hiểu",
    unknown: "Chưa cung cấp",
    you: "Bạn",
    student: "Sinh viên",
    reportSystemTitle: "Hệ thống cảnh báo sớm và chăm sóc học tập Đại học Quốc lập Đông Hoa",
    reportSystemSubtitle: "National Dong Hwa University Learning Care Early Alert System",
    reportSession: (count) => `Bản ghi đối thoại lần ${count}`,
    reportDate: "Ngày",
    reportName: "Tên",
    reportStudentId: "Mã số sinh viên",
    reportGrade: "Năm học",
    reportCollege: "Học viện",
    reportDepartment: "Khoa",
    reportGenerated: "Tạo lúc",
    reportCoverBackTitle: "Bản ghi chăm sóc học tập",
    reportCoverBackText: "Trang này được để trống làm trang lót bìa khi in và đóng quyển.",
    reportAnalysisLabel: "Learning Care Summary",
    reportAnalysisTitle: "Phân tích tổng hợp",
    reportTranscriptLabel: "Conversation Transcript",
    reportTranscriptTitle: "Nội dung đối thoại chi tiết",
    reportBackCoverText: "Cảm ơn bạn đã nói ra khó khăn trong học tập. Mong rằng bản ghi này giúp bạn nhìn rõ bước tiếp theo hơn.",
    txtSummaryTitle: "Phân tích tổng hợp",
    txtTranscriptTitle: "Nội dung đối thoại chi tiết"
  });

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

  function normalizeLanguage(value) {
    const language = safeText(value, "zh").toLowerCase();
    return Object.prototype.hasOwnProperty.call(I18N, language) ? language : "zh";
  }

  function tx(key) {
    const dict = I18N[state.language] || I18N.zh;
    return dict[key] === undefined ? I18N.zh[key] : dict[key];
  }

  function txValue(key, ...args) {
    const value = tx(key);
    return typeof value === "function" ? value(...args) : value;
  }

  function currentLocale() {
    return (LANGUAGE_META[state.language] || LANGUAGE_META.zh).locale;
  }

  function currentSpeechLanguage() {
    return (LANGUAGE_META[state.language] || LANGUAGE_META.zh).speech;
  }

  function setText(selector, text) {
    const node = $(selector);
    if (node) node.textContent = text;
  }

  function setPlaceholder(selector, text) {
    const node = $(selector);
    if (node) node.placeholder = text;
  }

  function setLabel(controlSelector, text) {
    const control = $(controlSelector);
    const label = control ? control.closest("label") : null;
    const span = label ? $("span", label) : null;
    if (span) span.textContent = text;
  }

  function setIconButton(selector, icon, text) {
    const button = $(selector);
    if (!button) return;
    button.innerHTML = `<i data-lucide="${escapeHtml(icon)}"></i>${escapeHtml(text)}`;
  }

  function namedText(template, name) {
    return String(template || "").replace("{name}", name || tx("student"));
  }

  function loadLanguage() {
    state.language = normalizeLanguage(localStorage.getItem(LANGUAGE_KEY) || "zh");
  }

  function applyLanguage() {
    const meta = LANGUAGE_META[state.language] || LANGUAGE_META.zh;
    document.documentElement.lang = meta.html;
    const selector = $("#languageSelect");
    if (selector) selector.value = state.language;
    setText("#brandTitle", tx("brandTitle"));
    setText("#brandSubtitle", tx("brandSubtitle"));
    setText("#languageLabel", tx("languageLabel"));
    setText("#entryTitle", tx("entryTitle"));
    setText("#entryIntro", tx("entryIntro"));
    setText('[data-auth-mode="register"]', tx("register"));
    setText('[data-auth-mode="login"]', tx("login"));
    setLabel("#nicknameInput", tx("nickname"));
    setLabel("#emailInput", tx("email"));
    setLabel("#passwordInput", tx("password"));
    setLabel("#confirmPasswordInput", tx("confirmPassword"));
    setLabel("#gradeSelect", tx("grade"));
    setLabel("#studentIdInput", tx("studentId"));
    setLabel("#collegeSelect", tx("college"));
    setLabel("#departmentSelect", tx("department"));
    setPlaceholder("#nicknameInput", tx("nicknamePlaceholder"));
    setPlaceholder("#emailInput", tx("emailPlaceholder"));
    setPlaceholder("#passwordInput", tx("passwordPlaceholder"));
    setPlaceholder("#confirmPasswordInput", tx("confirmPasswordPlaceholder"));
    setPlaceholder("#studentIdInput", tx("studentIdPlaceholder"));
    setIconButton("#backToEntryButton", "arrow-left", tx("backToEntry"));
    setIconButton("#clearChatButton", "eraser", tx("clearChat"));
    setIconButton("#downloadTxtButton", "file-text", tx("downloadTxt"));
    setIconButton("#downloadPdfButton", "file-down", tx("downloadPdf"));
    setIconButton(".send-button", "send", tx("send"));
    const voiceButton = $("#voiceInputButton");
    if (voiceButton) {
      const title = isListening ? tx("stopVoiceInput") : tx("voiceInput");
      voiceButton.setAttribute("title", title);
      voiceButton.setAttribute("aria-label", title);
    }
    const limitDialogText = $("#limitDialog p");
    if (limitDialogText) limitDialogText.textContent = tx("limitDialog");
    const limitButton = $("#limitDialog button");
    if (limitButton) limitButton.textContent = tx("limitOk");
    if (speechRecognition) speechRecognition.lang = currentSpeechLanguage();
    syncAuthFormState();
    const chatInput = $("#chatInput");
    if (chatInput) chatInput.placeholder = namedText(tx("chatInput"), state.profile.nickname || tx("student"));
    iconRefresh();
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
    return date.toLocaleTimeString(currentLocale(), {
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

  function chatIsVisible() {
    const chatView = $("#chatView");
    return !!(chatView && !chatView.classList.contains("hidden"));
  }

  function clearIdlePromptTimer() {
    if (!idlePromptTimer) return;
    window.clearTimeout(idlePromptTimer);
    idlePromptTimer = 0;
  }

  function scheduleIdlePrompt(stage = 0) {
    clearIdlePromptTimer();
    if (!chatIsVisible() || stage >= IDLE_PROMPT_DELAYS.length) return;
    idlePromptTimer = window.setTimeout(() => {
      idlePromptTimer = 0;
      if (!chatIsVisible()) return;
      addMessage("agent", tx(IDLE_PROMPT_KEYS[stage]));
      scheduleIdlePrompt(stage + 1);
    }, IDLE_PROMPT_DELAYS[stage]);
  }

  function restartIdlePrompts() {
    clearIdlePromptTimer();
    if (chatIsVisible()) scheduleIdlePrompt(0);
  }

  function showView(viewId) {
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("hidden", view.id !== viewId);
    });
    if (viewId !== "chatView") clearIdlePromptTimer();
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
    const identity = normalizedStudentId() || normalizeEmail(state.profile.email) || "UNKNOWN";
    const key = `${SESSION_COUNT_KEY}.${identity}`;
    const current = Number.parseInt(localStorage.getItem(key) || "0", 10);
    const next = Number.isFinite(current) ? current + 1 : 1;
    localStorage.setItem(key, String(next));
    return next;
  }

  function todayKey() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  }

  function dailyLimitIdentity() {
    return normalizedStudentId() || normalizeEmail(state.profile.email) || "unknown";
  }

  function dailyTurnStorageKey() {
    return `${DAILY_TURN_KEY}.${dailyLimitIdentity()}.${todayKey()}`;
  }

  function getDailyTurnCount() {
    const count = Number.parseInt(localStorage.getItem(dailyTurnStorageKey()) || "0", 10);
    return Number.isFinite(count) ? count : 0;
  }

  function setDailyTurnCount(count) {
    localStorage.setItem(dailyTurnStorageKey(), String(Math.max(0, Number(count) || 0)));
  }

  function incrementDailyTurnCount() {
    const next = getDailyTurnCount() + 1;
    setDailyTurnCount(next);
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
    window.alert(tx("limitDialog") || LIMIT_DIALOG_TEXT);
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
    if (title) title.textContent = isRegister ? tx("authTitleRegister") : tx("authTitleLogin");
    if (hint) {
      hint.textContent = isRegister
        ? tx("authHintRegister")
        : tx("authHintLogin");
    }
    if (submit) submit.textContent = isRegister ? tx("submitRegister") : tx("submitLogin");
  }

  async function loadSessionContext() {
    try {
      const data = await requestGas("sessionContext", {
        context: state.profile,
        sessionId: state.sessionId,
        language: state.language
      }, 12000);
      if (data && data.ok) return data;
    } catch (err) {
      // If the session lookup is unavailable, the chat can still start locally.
    }
    return {
      ok: true,
      sessionNumber: nextSessionNumber(),
      hasPrevious: false,
      previousTopic: ""
    };
  }

  function openingGreeting(sessionContext) {
    const name = state.profile.nickname || tx("student");
    const sessionNumber = Number(sessionContext && sessionContext.sessionNumber) || 1;
    const previousTopic = safeText(sessionContext && sessionContext.previousTopic);
    if (sessionNumber > 1 || (sessionContext && sessionContext.hasPrevious)) {
      return txValue("returningGreeting", name, previousTopic);
    }
    return txValue("firstGreeting", name);
  }

  async function prepareChatSession() {
    clearIdlePromptTimer();
    const chatInput = $("#chatInput");
    const sendButton = $("#chatForm button[type='submit']");
    if (chatInput) chatInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    state.sessionNumber = 0;
    state.sessionId = uid("session");
    state.messages = [];
    state.reportAnalysis = "";
    $("#chatLog").innerHTML = "";
    $("#chatInput").placeholder = namedText(tx("chatInput"), state.profile.nickname || tx("student"));
    updateExportState();
    showView("chatView");
    const sessionContext = await loadSessionContext();
    state.sessionNumber = Math.max(1, Number(sessionContext.sessionNumber) || 1);
    addMessage("agent", openingGreeting(sessionContext));
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.focus();
    }
    if (sendButton) sendButton.disabled = false;
    restartIdlePrompts();
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = normalizeEmail(form.get("email"));
    const password = String(form.get("password") || "");
    if (!email) {
      showToast(tx("enterEmail"));
      $("#emailInput").focus();
      return;
    }
    if (password.length < 8) {
      showToast(tx("passwordShort"));
      $("#passwordInput").focus();
      return;
    }

    if (state.authMode === "login") {
      const student = findStudent(email);
      if (!student) {
        showToast(tx("emailNotFound"));
        setAuthMode("register");
        return;
      }
      const passwordHash = await hashSecret(password, student.passwordSalt || "");
      if (passwordHash !== student.passwordHash) {
        showToast(tx("wrongPassword"));
        $("#passwordInput").focus();
        return;
      }
      student.lastLoginAt = new Date().toISOString();
      saveStudents();
      setCurrentStudent(student);
      $("#passwordInput").value = "";
      await prepareChatSession();
      showToast(tx("loginSuccess"));
      return;
    }

    const confirmPassword = String(form.get("confirmPassword") || "");
    if (password !== confirmPassword) {
      showToast(tx("passwordMismatch"));
      $("#confirmPasswordInput").focus();
      return;
    }
    if (findStudent(email)) {
      showToast(tx("emailRegistered"));
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
    await prepareChatSession();
    showToast(tx("registerSuccess"));
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
    const speaker = message.role === "user" ? (state.profile.nickname || tx("you")) : tx("anan");
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
      <strong>${escapeHtml(tx("anan"))}</strong>
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
      showToast(tx("loginFirst"));
      returnToEntry();
      return;
    }
    if (hasReachedDailyLimit()) {
      showLimitDialog();
      return;
    }

    clearIdlePromptTimer();
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
      meta: "",
      sequence: state.messages.length + 1
    };
    state.messages.push(replyMessage);
    if (Number(reply.sessionNumber) > 0) state.sessionNumber = Number(reply.sessionNumber);
    if (reply.source === "llm") {
      const dailyTurnCount = Number(reply.dailyTurnCount || 0);
      if (dailyTurnCount > 0) setDailyTurnCount(dailyTurnCount);
      else incrementDailyTurnCount();
    }
    state.reportAnalysis = "";
    updateMessageNode(pending, replyMessage.text, replyMessage.timestamp, replyMessage.meta);
    updateExportState();
    restartIdlePrompts();
  }

  function renderPendingMessage() {
    const node = document.createElement("article");
    node.className = "message agent pending";
    node.innerHTML = `
      <strong>${escapeHtml(tx("anan"))}</strong>
      <span>${escapeHtml(tx("thinking"))}</span>
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
      sessionId: state.sessionId,
      sessionNumber: state.sessionNumber,
      language: state.language,
      dailyTurnLimit: DAILY_TURN_LIMIT,
      clientDailyTurnCount: getDailyTurnCount()
    };

    try {
      const data = await requestGas("llmChat", payload, LLM_TIMEOUT_MS);
      if (data && data.limitReached) return { limitReached: true };
      if (data && data.ok && safeText(data.reply)) {
        return { text: safeText(data.reply), source: "llm", dailyTurnCount: data.dailyTurnCount, sessionNumber: data.sessionNumber };
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
    clearIdlePromptTimer();
    state.messages = [];
    state.reportAnalysis = "";
    $("#chatLog").innerHTML = "";
    updateExportState();
    $("#chatInput").focus();
  }

  function returnToEntry() {
    clearIdlePromptTimer();
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
    return txValue("reportSession", count);
  }

  function reportDate() {
    return new Date().toLocaleString(currentLocale(), {
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
      name: state.profile.nickname || tx("unknown"),
      email: state.profile.email || tx("unknown"),
      studentId: state.profile.studentId || tx("unknown"),
      grade: state.profile.grade || tx("unknown"),
      college: state.profile.college || tx("unknown"),
      department: state.profile.department || tx("unknown")
    };
  }

  function transcriptText() {
    return conversationMessages().map((message) => {
      const speaker = message.role === "user" ? (state.profile.nickname || tx("you")) : tx("anan");
      const time = new Date(message.timestamp).toLocaleString(currentLocale());
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
    if (/情緒|焦慮|憂鬱|恐慌|睡不著|孤單|很痛苦|很想死|想死|霸凌|被霸凌|打架|肢體衝突|受傷|校安|不安全|安全疑慮/.test(combined)) topicHints.push("情緒與安全支持");
    const topics = topicHints.length ? topicHints.join("、") : "目前談到的學習卡點";
    const name = state.profile.nickname || "同學";
    const first = userTexts[0] || "你提到目前學習上有些卡住";
    const last = userTexts[userTexts.length - 1] || first;
    const excerpt = (text) => {
      const clean = safeText(text).replace(/\s+/g, " ");
      return clean.length > 44 ? `${clean.slice(0, 44)}...` : clean;
    };
    const hasSafetyConcern = /很想死|想死|自傷|傷害自己|傷人|打架|肢體衝突|受傷|校安|不安全|安全疑慮|霸凌|被霸凌/.test(combined);
    const hasHighDistress = /很想死|想死|快撐不住|很痛苦|絕望|焦慮|憂鬱|恐慌|睡不著/.test(combined);
    const supportTarget = hasSafetyConcern ? "校安、導師、系辦或諮商中心" : "導師、助教、系辦或諮商中心";

    if (hasSafetyConcern || hasHighDistress) {
      return [
        `${name}，謝謝你願意把這些話留下來。你提到「${excerpt(first)}」，後面又補充「${excerpt(last)}」，這些都不是小事；當學業壓力、人際衝突或不安全感一起出現時，人會覺得慌、很累，甚至不知道下一步要怎麼開口，這是可以被理解的。`,
        `從這段對話看起來，你其實已經在努力求助，也願意讓身邊的人知道現在需要協助。接下來請先把安全放在最前面：如果事情還在現場、有人受傷，或你擔心衝突又發生，請優先聯繫校安或身邊可信任的人，讓你不是一個人面對。`,
        `如果狀況暫時安全，可以把這份紀錄帶著，找${supportTarget}談。你可以直接說：「我最近因為學業和人際狀況，已經影響到生活和學習，我需要有人陪我整理接下來怎麼處理。」這樣說就夠了，不需要把所有事情一次講完。`
      ].join("\n\n");
    }

    return [
      `${name}，你願意把「${topics}」說出來，已經是在替自己找一個出口。從「${excerpt(first)}」到「${excerpt(last)}」，可以感覺你不是不想處理，而是壓力累積到一個人很難安靜整理。`,
      "我想先回饋你一件事：現在最需要的不是逼自己立刻變得很有方法，而是先讓問題被看見、被說清楚。當作業、考試或時間壓在一起時，先有人陪你分辨哪一件最急、哪一件可以求助，會比自己硬撐來得穩。",
      `接下來可以帶著這份紀錄找${supportTarget}談，請對方陪你一起確認優先順序。若你想先自己準備，也可以先寫下三句話：我現在卡在哪裡、它已經影響到什麼、我希望對方怎麼幫我。這樣開口時會比較有依靠。`
    ].join("\n\n");
  }

  async function reportAnalysis() {
    if (state.reportAnalysis) return state.reportAnalysis;
    const payload = {
      context: state.profile,
      messages: conversationMessages(),
      sessionNumber: state.sessionNumber,
      language: state.language,
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
      showToast(tx("noConversation"));
      return;
    }
    const meta = reportMeta();
    const analysis = await reportAnalysis();
    const content = [
      `LCEAS ${tx("reportSystemTitle")}`,
      tx("reportSystemSubtitle"),
      meta.title,
      "",
      `${tx("reportDate")}：${meta.date}`,
      `${tx("reportName")}：${meta.name}`,
      `${tx("reportEmail")}：${meta.email}`,
      `${tx("reportStudentId")}：${meta.studentId}`,
      `${tx("reportGrade")}：${meta.grade}`,
      `${tx("reportCollege")}：${meta.college}`,
      `${tx("reportDepartment")}：${meta.department}`,
      "",
      tx("txtSummaryTitle"),
      analysis,
      "",
      tx("txtTranscriptTitle"),
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

  function backCoverSubtitleHtml() {
    const subtitle = tx("reportSystemSubtitle");
    if (/National Dong Hwa University Learning Care Early Alert System/i.test(subtitle)) {
      return "<span>National Dong Hwa University</span><span>Learning Care Early Alert System</span>";
    }
    return escapeHtml(subtitle);
  }

  function reportTurnHtml(message) {
    const speaker = message.role === "user" ? (state.profile.nickname || tx("you")) : tx("anan");
    const time = new Date(message.timestamp).toLocaleString(currentLocale());
    return `
      <article class="report-turn ${message.role}">
        <div class="report-turn-meta">${escapeHtml(String(message.sequence || ""))}｜${escapeHtml(time)}｜${escapeHtml(speaker)}</div>
        <div class="report-turn-text">${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>
      </article>
    `;
  }

  function estimateReportTurnHeight(message) {
    const text = safeText(message.text);
    const lines = Math.max(2, Math.ceil(text.length / 34) + (text.match(/\n/g) || []).length);
    return 58 + (lines * 24);
  }

  function transcriptPages() {
    const pages = [];
    let current = [];
    let height = 0;
    const maxHeight = 760;
    conversationMessages().forEach((message) => {
      const turnHeight = Math.min(680, estimateReportTurnHeight(message));
      if (current.length && height + turnHeight > maxHeight) {
        pages.push(current);
        current = [];
        height = 0;
      }
      current.push(message);
      height += turnHeight + 16;
    });
    if (current.length) pages.push(current);
    return pages.length ? pages : [[]];
  }

  function reportMetaRows(meta) {
    return [
      [tx("reportDate"), meta.date],
      [tx("reportName"), meta.name],
      [tx("reportStudentId"), meta.studentId],
      [tx("reportGrade"), meta.grade],
      [tx("reportCollege"), meta.college],
      [tx("reportDepartment"), meta.department],
      [tx("reportEmail"), meta.email]
    ].map(([label, value]) => `
      <div class="report-profile-item">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `).join("");
  }

  function reportHtml(analysis) {
    const meta = reportMeta();
    const transcriptSections = transcriptPages().map((pageMessages, index) => `
      <section class="report-page report-dialogue${index ? " report-dialogue-continued" : ""}">
        <div class="report-section-label">${escapeHtml(tx("reportTranscriptLabel"))}</div>
        <h2>${escapeHtml(tx("reportTranscriptTitle"))}</h2>
        <div class="report-turns">${pageMessages.map(reportTurnHtml).join("")}</div>
      </section>
    `).join("");
    return `
      <div class="report-document">
        <section class="report-page report-cover">
          <div class="report-cover-photo-wrap">
            <img class="report-cover-photo" src="assets/img/ndhu-campus-lake.jpg" alt="National Dong Hwa University campus lake">
          </div>
          <div class="report-cover-content">
            <div class="report-cover-header">
              <img class="report-cover-emblem" src="assets/img/ndhu-emblem.png" alt="NDHU emblem">
              <div>
                <p>LCEAS</p>
                <h1>${escapeHtml(tx("reportSystemTitle"))}</h1>
                <span>${escapeHtml(tx("reportSystemSubtitle"))}</span>
              </div>
            </div>
            <h2>${escapeHtml(meta.title)}</h2>
            <dl class="report-profile-grid">${reportMetaRows(meta)}</dl>
          </div>
        </section>
        <section class="report-page report-cover-back" aria-hidden="true"></section>
        <section class="report-page report-analysis-page">
          <div class="report-section-label">${escapeHtml(tx("reportAnalysisLabel"))}</div>
          <h2>${escapeHtml(tx("reportAnalysisTitle"))}</h2>
          <div class="report-analysis-card">
            <div class="report-analysis">${paragraphHtml(analysis)}</div>
          </div>
        </section>
        ${transcriptSections}
        <section class="report-page report-back-cover">
          <div class="report-back-cover-inner">
            <img src="assets/img/ndhu-emblem.png" alt="NDHU emblem">
            <h2>${escapeHtml(tx("reportSystemTitle"))}</h2>
            <p>${backCoverSubtitleHtml()}</p>
            <span>${escapeHtml(tx("reportBackCoverText"))}</span>
          </div>
        </section>
      </div>
    `;
  }

  function openPrintableReport(html) {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      showToast(tx("popupBlocked"));
      return;
    }
    const htmlLang = (LANGUAGE_META[state.language] || LANGUAGE_META.zh).html;
    win.document.write(`<!doctype html><html lang="${escapeHtml(htmlLang)}"><head><meta charset="utf-8"><title>LCEAS PDF</title><link rel="stylesheet" href="assets/css/styles.css"></head><body>${html}<script>window.onload=()=>window.print();</script></body></html>`);
    win.document.close();
  }

  function addPdfPageNumbers(pdf) {
    if (!pdf || !pdf.internal) return;
    const totalPages = pdf.internal.getNumberOfPages();
    const pageSize = pdf.internal.pageSize;
    const width = typeof pageSize.getWidth === "function" ? pageSize.getWidth() : pageSize.width;
    const height = typeof pageSize.getHeight === "function" ? pageSize.getHeight() : pageSize.height;
    for (let page = 3; page < totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(10);
      pdf.setTextColor(99, 118, 115);
      pdf.text(String(page - 2), width / 2, height - 28, { align: "center" });
    }
  }

  async function downloadPdfReport() {
    if (!hasConversation()) {
      showToast(tx("noConversation"));
      return;
    }
    const button = $("#downloadPdfButton");
    if (button) button.disabled = true;
    showToast(tx("pdfPreparing"));
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
          margin: [0, 0, 0, 0],
          filename: `LCEAS-${fileSafeName(meta.name)}-${fileSafeName(meta.studentId)}-${state.sessionNumber || 1}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: [".report-turn", ".report-analysis-card"] }
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
      restartIdlePrompts();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      $("#chatForm").requestSubmit();
    });

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      button.addEventListener("click", () => showToast(tx("speechUnsupported")));
      return;
    }

    speechRecognition = new Recognition();
    speechRecognition.lang = currentSpeechLanguage();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;
    let baseText = "";

    speechRecognition.addEventListener("start", () => {
      isListening = true;
      baseText = input.value.trim();
      button.classList.add("listening");
      button.setAttribute("aria-label", tx("stopVoiceInput"));
      button.setAttribute("title", tx("stopVoiceInput"));
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
      if (event.error !== "no-speech") showToast(tx("speechUnavailable"));
    });

    speechRecognition.addEventListener("end", () => {
      isListening = false;
      button.classList.remove("listening");
      button.setAttribute("aria-label", tx("voiceInput"));
      button.setAttribute("title", tx("voiceInput"));
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
        showToast(tx("speechPreparing"));
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
    const languageSelect = $("#languageSelect");
    if (languageSelect) {
      languageSelect.addEventListener("change", () => {
        state.language = normalizeLanguage(languageSelect.value);
        localStorage.setItem(LANGUAGE_KEY, state.language);
        state.reportAnalysis = "";
        applyLanguage();
        renderConversation();
      });
    }
  }

  function init() {
    loadSettings();
    loadLanguage();
    loadAuthState();
    populateProfileOptions();
    bindEvents();
    setAuthMode("register");
    setupUsageConsent();
    setupVoiceInput();
    applyLanguage();
    updateExportState();
    iconRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
