# Google Sheet 與 GAS 部署

## 1. 建立資料表

本專案已建立 `data/ndhu-learning-warning-schema.xlsx`，可匯入 Google Drive 並轉成原生 Google Sheets。匯入後保留以下工作表：

- `Settings`
- `CollegesDepartments`
- `Students`
- `Teachers`
- `LearningCheckins`
- `Conversations`
- `RiskSignals`
- `InterventionPlans`
- `TeacherNotes`
- `Referrals`
- `AnalyticsDashboard`
- `AuditLog`

本次已透過 Google Drive API 建立一份原生 Google Sheets：

`https://docs.google.com/spreadsheets/d/1MCCPpfNke0UimmqHsqhO3Qx23lnT5qVE4jo2hh7PDnw/edit?usp=drivesdk`

## 2. 建立 Apps Script

1. 開啟匯入後的 Google Sheet。
2. 選擇「擴充功能」→「Apps Script」。
3. 將 `gas/Code.gs` 貼到 Apps Script。
4. 把 `SPREADSHEET_ID` 改成該試算表網址中的 id。
5. 在 Script Properties 設定：
   - `ADMIN_SHARED_SECRET`：教師端查詢 token。
   - `OPENAI_API_KEY`：若要使用 OpenAI 分析才需要。
   - `OPENAI_MODEL`：可省略，預設使用 `gpt-4o-mini`。

## 3. 部署 Web App

1. 選擇「部署」→「新增部署作業」。
2. 類型選「網路應用程式」。
3. 執行身分選「我」。
4. 存取權依校內政策設定；若 GitHub Pages 需跨網域寫入，通常需允許可存取此 Web App 的使用者提交。
5. 複製 Web App URL。

本次也已建立 Apps Script 專案並推送 `gas/Code.gs`：

`https://script.google.com/d/1pD06aBJGJl_6NIc1dWvlXduY21nxrIQbGqaqEuHpgp6ZOGQHypIG_8dS/edit`

第一次正式啟用前，請在 Apps Script 編輯器中執行 `manualSetup` 並授權試算表存取；完成授權後再部署或更新 Web App。

## 4. 串接前台

將 Web App URL 放入 `assets/js/app.js` 的 `gasEndpoint`，或讓管理者在網頁的「連線設定」中貼上 URL。學生送出紀錄後，系統會寫入 Google Sheet；教師端查詢時會要求教師 token。

## 5. AI 分析

若設定 `OPENAI_API_KEY`，GAS 會在 `submitCheckin` 與 `submitConversation` 時嘗試產生更精準的摘要、風險標籤與建議行動。若未設定，系統會使用內建規則式分析，前台仍可運作。
