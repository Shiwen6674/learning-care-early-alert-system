# GAS 與 OpenAI API 部署

這一版的 LCEAS 採用「前台不保存對話、GAS 只做代理」的設計。GAS 不建立教師後台、不寫入 Google Sheet，只負責安全地呼叫 OpenAI API 產生安安的回覆。

## 1. 建立或開啟 Apps Script

1. 開啟 Apps Script 專案。
2. 將 `gas/Code.gs` 貼到 Apps Script。
3. 在 Apps Script 左側選擇「專案設定」。
4. 在 Script Properties 設定：
   - `OPENAI_API_KEY`：你的 OpenAI API key。
   - `OPENAI_MODEL`：可省略，預設使用 `gpt-5.4-mini`。

API key 只能放在 Script Properties，不要放進 `assets/js/app.js`、HTML、README 或 GitHub repository。

## 2. 部署 Web App

1. 選擇「部署」→「新增部署作業」。
2. 類型選「網路應用程式」。
3. 執行身分選「我」。
4. 存取權依校內政策設定。
5. 複製 Web App URL。

## 3. 串接前台

在網頁右上角按「連線設定」，貼上 Web App URL。學生送出訊息後，前台會呼叫 GAS 的 `llmChat` 動作取得安安回覆。

## 4. 安安的 GAS 指令

GAS 中已設定安安的 system prompt：安安是國立東華大學 LCEAS 的溫和友善學習陪伴導師型 AI，協助學生整理學習困難與下一步；不保存對話、不建立教師後台、不取代專業諮商。

## 5. 若尚未設定 API Key

若未設定 `OPENAI_API_KEY` 或前台未填入 Web App URL，網頁仍會使用本機備援回覆，讓學生可以先和安安整理學習卡點。
