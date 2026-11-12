# 星之庭院保衛戰 Star Garden Rumble

低面數 3D 物理防守街機原型：Vite + Three.js + `@dimforge/rapier3d-compat` + Zustand。

```bash
npm install
npm run dev     # 開發
npm run build   # 產出 dist/
```

## 玩法

按住畫面任意處向後拖曳、放開即彈射守護球（瞄準時進入慢動作）。把滾向水晶的小怪撞出浮島缺口或撞飛越過圍欄即可得分；水晶被碰 5 次遊戲結束。

## 結構

| 檔案 | 內容 |
| --- | --- |
| `src/config.js` | 所有手感 / 數值參數（彈性、阻尼、衝量、波次…） |
| `src/game.js` | Rapier 世界、固定步長主循環、碰撞事件、擊飛判定 |
| `src/arena.js` | 浮島地面、帶缺口的環狀圍欄、水晶、彈力蘑菇 |
| `src/player.js` | 主控球剛體、指標輸入、Line2 瞄準線與反彈預測 |
| `src/enemies.js` | 敵人生成池（剛體 / Mesh 重複利用）與追擊推力 |
| `src/fx.js` | Instanced 星星粒子、螢幕震動、彈跳分數字 |
| `src/store.js` / `src/hud.js` | Zustand 狀態與 HUD |
