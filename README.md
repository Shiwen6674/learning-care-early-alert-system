# Learning Care Early Alert System (LCEAS)

東華大學學生學習預警輔導系統。學生可以和「東東」整理學習困難、取得下一步建議；教師可以在教師端掌握學生近況、預警訊號與追蹤行動。

## 已包含的內容

- `index.html`：學生端、教師端、註冊登入與東東學習陪伴聊天入口。
- `learning care early alert system.html`：GitHub Pages 可直接開啟的 LCEAS 主頁。
- `assets/css/styles.css`：前台視覺與響應式版面。
- `assets/js/app.js`：前台 session、聊天流程、風險初判、教師儀表板與 GAS 同步。
- `assets/js/ndhu-data.js`：東華八大學院與招生系所選單資料。
- `gas/Code.gs`：Google Apps Script 後端 API。
- `data/ndhu-learning-warning-schema.xlsx`：可匯入 Google Sheets 的後端資料表結構。
- `docs/agentic-workflow.md`：學習陪伴 agentic workflow。
- `docs/gas-deploy.md`：Google Sheet 與 GAS 部署步驟。
- `docs/privacy-and-roles.md`：角色權限與資料保護建議。

## 本次建立的雲端資源

- Google Sheet：<https://docs.google.com/spreadsheets/d/1MCCPpfNke0UimmqHsqhO3Qx23lnT5qVE4jo2hh7PDnw/edit?usp=drivesdk>
- Apps Script：<https://script.google.com/d/1pD06aBJGJl_6NIc1dWvlXduY21nxrIQbGqaqEuHpgp6ZOGQHypIG_8dS/edit>

Apps Script 第一次正式使用前，需要在編輯器中執行 `manualSetup` 完成授權，再部署 Web App URL 給前台使用。

## 部署概要

1. 將本專案推到 GitHub repository，並啟用 GitHub Pages。
2. 將 `data/ndhu-learning-warning-schema.xlsx` 匯入 Google Drive，轉成原生 Google Sheets。
3. 在 Google Apps Script 貼上 `gas/Code.gs`，設定 `SPREADSHEET_ID`、`ADMIN_SHARED_SECRET`，必要時設定 `OPENAI_API_KEY`。
4. 將部署後的 GAS Web App URL 填入 `assets/js/app.js` 的 `gasEndpoint`，或在網頁右下的連線設定中輸入。

正式上線時建議使用 Google Workspace / OAuth 做身分驗證；公開 GitHub Pages 不應保存教師密碼、API key 或完整學生敏感資料。
