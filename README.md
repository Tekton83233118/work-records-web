# 工作紀錄資料庫網站（第一版）

## 目前包含
- Supabase Email / Password 登入與登出
- 工作紀錄列表與關鍵字搜尋
- 新增、編輯、刪除主要工作紀錄
- 一筆紀錄可新增多個工作項目
- 工作項目可選工作分類及專案
- 薄荷綠、奶油黃、乳白、少量鮭魚粉配色
- 桌面及手機版面

## 重要資料安全
- 前端只使用 Supabase Project URL 與 Publishable key。
- 不要放入 service_role 或 Secret key。
- 資料存取仍由 Supabase RLS 控制。

## 本機啟動
1. 安裝 Node.js LTS。
2. 解壓縮專案。
3. 在專案根目錄將 `.env.example` 複製成 `.env`。
4. 填入 Supabase Project URL 及 Publishable key。
5. 開啟終端機執行：

   ```bash
   npm install
   npm run dev
   ```

6. 依終端機顯示的網址開啟（通常是 http://localhost:5173）。

## Supabase 設定
- Project URL：Supabase > Project Settings > API
- Publishable key：Supabase > Project Settings > API Keys
- 網站登入使用已建立的個人帳號；不需要開放公開註冊。

## 資料表假設
程式依照目前提供的 schema 使用：
- work_logs: id, user_id, log_date, title, summary
- work_items: id, user_id, log_id, content, category_id, project_id, sort_order
- work_categories: id, user_id, name, sort_order, is_active
- projects: id, user_id, name, is_active

編輯工作項目時會依照項目 ID 逐筆更新、新增或刪除，不會為了編輯整筆清空工作項目，因此可保留未被刪除項目的標籤與對象關聯。

## 尚未完成
專案管理、對象管理、分類標籤管理、工作項目標籤與對象關聯、教學資料、進階篩選及分析報表會在後續版本接上。
