# Learning Care Early Alert System (LCEAS)

國立東華大學學習關懷預警系統。這一版以「安安」作為 AI 學習陪伴入口，協助學生整理課業、作業、考試準備、跨域修課、時間安排與求助表達。

## 目前版本

- 不建立教師後台。
- 不把完整內容寫入 Google Sheet 或資料庫。
- 前端只保留本次頁面互動所需的訊息狀態。
- OpenAI API key 只放在 GAS Script Properties，不放前台或 GitHub。

## 已包含的內容

- `index.html`：GitHub Pages 首頁與安安聊天入口。
- `learning care early alert system.html`：GitHub Pages 可直接開啟的 LCEAS 主頁。
- `assets/css/styles.css`：東華風格、柔和溫暖的前台視覺與響應式版面。
- `assets/js/app.js`：安安聊天流程、語音輸入、對話下載、GAS LLM 代理。
- `assets/js/ndhu-data.js`：東華學院與系所選單資料。
- `gas/Code.gs`：Google Apps Script LLM 代理。
- `docs/gas-deploy.md`：GAS 與 OpenAI API 部署方式。
- `docs/privacy-and-roles.md`：資料使用與安心說明。
- `docs/agentic-workflow.md`：安安的學習陪伴流程。

## 部署概要

1. 將本專案推到 GitHub repository，並啟用 GitHub Pages。
2. 在 Apps Script 貼上 `gas/Code.gs`。
3. 在 Script Properties 設定 `OPENAI_API_KEY` 或 `API_KEY`，可選擇設定 `OPENAI_MODEL`。
4. 部署 GAS Web App。若前台使用 GitHub Pages，Web App 存取權需允許前台呼叫 `/exec`，再將 Web App URL 貼到網頁右上角「連線設定」。

若 GAS Web App 尚未開通或 API key 尚未設定，前台會明確顯示無法取得 AI 回覆，不會產生非 AI 回覆。
