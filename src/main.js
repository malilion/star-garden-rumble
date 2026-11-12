import { createGame } from './game.js';

createGame(document.getElementById('game')).then((game) => {
  if (import.meta.env.DEV) window.__game = game; // 開發時方便在 console 除錯
});
