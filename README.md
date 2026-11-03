# 🎲 小數富翁探險島

國小六年級小數應用線上大富翁：**1 位房主＋最多 5 位學生，同步遊玩（共 6 人）**。遊戲為繁體中文，網頁可使用電腦、平板與手機。房主可以是第六位玩家，同時控制開局、跳過回合與結算。

## 功能

- Socket.IO 即時連線，同步棋盤、擲骰、答題、資金、房產與排行榜。
- 6 碼房號、可複製邀請連結；12 種不同動物（包含自己繪製的水豚、貓、狗、兔子等）。
- 24 格地圖：11 處可買房產、機會、命運、折扣、比價、黑心商人、寶箱、Boss、稅務局、補給站與起點。
- **91 道精選小六數學題**，涵蓋小數加減乘除、單價、折數、單位換算及購物應用；每次出題會打亂選項，每種類別題目用完前不重複。
- 所有擲骰、金額、判分、購地與房產所有權由**伺服器**管理；前端不取得未作答的正解。
- 答題限時 80 秒，提交後展示正解與算式解析；Boss 需連續挑戰兩題。
- 4／6／8／10／12 輪可調整；初始資金 $600／$900／$1200 可調整；所有人完成後依總資產排名。
- 重新整理或短暫斷線時，保留瀏覽器儲存的角色身分並嘗試恢復連線。
- 房主可跳過目前回合、提前結算、邀請原班人馬再玩一局。

## 資產與特殊格規則

| 事件 | 規則 |
|---|---|
| 起點 | 每次經過或抵達起點領取 $200（開場站在起點不算）。 |
| 無主房產 | 資金足夠才會觸發購地題；答對取得購買資格，可自行選擇購買或放棄。購買價與房租顯示在地圖。 |
| 別人的房產 | 有錢就支付固定過路費給地主，自己的房產免繳。 |
| 過路費不足 | **一定要答救援題**。答對：支付現有現金，學習基金補足差額給地主；答錯：付出現有現金，且下次輪到自己時暫停擲骰一次。金額不會變負數。 |
| 稅務局 | 正常繳 $60；不足時救援題答對可減半，答錯繳出可付金額並暫停下一輪。 |
| 折扣／神算／比價 | 必須答題，答對拿固定獎金，答錯不加錢。 |
| 黑心商人 | 答對揭穿陷阱獲得 $100；答錯最多損失 $80。 |
| 神祕寶箱 | 答對 $180；答錯仍有安慰獎 $25。 |
| 機會／命運 | 隨機抽事件卡，必須答一題；依卡片與正確與否決定獲利或支出。 |
| 終極 Boss | 連續答 2 題：兩題正確 +$250；一題正確 +$90；都錯最多 -$90。 |
| 補給站 | 得到 $30。 |
| 結束 | **總資產 = 持有現金 + 所有房產的購買價格**；同分以答對題數多者優先。 |

> 本專案以「數學練習」為首要目標，不設破產淘汰。資金為遊戲虛擬幣，不涉及真實交易。

## 本機執行

需要 Node.js 20 以上。

```bash
npm install
npm start
```

開啟 `http://localhost:3000`；如果想模擬多人，使用不同瀏覽器／無痕視窗加入同一個房間代碼。

執行邏輯測試：

```bash
npm test
```

健康檢查 URL：`http://localhost:3000/health`。

## 上傳 GitHub

1. 至 [GitHub 新建儲存庫](https://github.com/new)，例如取名 `decimal-monopoly-classroom`，不必在網頁先勾選 README。
2. 將此資料夾中的檔案（**不是把 ZIP 當作唯一檔案**）上傳至該儲存庫；可使用 GitHub 網頁的 **Add file → Upload files**，或使用下列指令：

```bash
cd decimal-monopoly
git init
git add .
git commit -m "Create decimal monopoly classroom game"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/decimal-monopoly-classroom.git
git push -u origin main
```

> 記得把 `<YOUR-USERNAME>` 換成 GitHub 帳號；不要把 `node_modules` 上傳。

## 部署至 Render

### 方式 A：Blueprint（優先）

1. 登入 [Render Dashboard](https://dashboard.render.com/)。
2. 選 **New → Blueprint**，連接有 `render.yaml` 的 GitHub 儲存庫。
3. Render 會讀取 `render.yaml`，建立位於新加坡、使用 Node.js 的單一 Web Service：
   - Build Command：`npm install --omit=dev`
   - Start Command：`npm start`
   - Health Check：`/health`
   - Plan：`free`（可依需要改為付費方案）
4. 部署完成後，使用 Render 給的 `https://<service-name>.onrender.com` 網址。房主先開房，再分享房間內的邀請連結給同學。

### 方式 B：手動 Web Service

選 **New → Web Service** → GitHub repository → Language `Node` → Build Command `npm install --omit=dev` → Start Command `npm start` → Instance `Free`。本專案同時提供 `render.yaml`，兩種方式擇一即可。

> ⚠️ **Render Free 服務的重要限制**：閒置約 15 分鐘可能休眠，喚醒時需要一段時間；重新部署、重啟或休眠會讓**記憶體中的房間與資產資料消失**。建議老師在上課前先開啟連結，遊戲進行中不要部署新版本。如果要跨堂儲存與斷線重建房間，需要再加入持久化資料庫（例如 Render Postgres／Key Value）。本版本採單一伺服器程序，不能直接水平擴充多實例。

## 檔案結構

```text
decimal-monopoly/
├── public/
│   ├── index.html      # 中文使用者介面
│   ├── style.css       # 桌機／手機響應式樣式
│   ├── app.js          # 前端連線與畫面
│   └── capybara.svg    # 水豚棋子圖示
├── test/game.test.js   # 規則與題庫測試
├── board.js            # 24 格地圖、動物清單
├── questions.js        # 91 題伺服器端題庫
├── game.js             # 回合／資金／判分規則
├── server.js           # Express + Socket.IO
├── render.yaml         # Render 部署藍圖
├── package.json
├── .nvmrc
└── .gitignore
```

## 教師建議

- 房主在教室投影自己的畫面，學生透過房號進入；如果學生只用一台裝置，亦可由房主輪流操作。
- 標準建議選「8 輪、$900」。在 80 分鐘課堂中也可改為 4～6 輪，以保留講解與回饋時間。
- 購地題答錯或過路費救援失敗時，適合停下來請學生說明：**被除數／除數的意義、折數和單價的計算、金額與單位如何檢查**。
- 結算時可用排行榜與答題紀錄討論「現金流」和「購置房產」的取捨。

## 授權

MIT License。水豚 SVG 為本專案原創繪製。
