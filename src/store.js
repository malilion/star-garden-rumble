import { createStore } from 'zustand/vanilla';
import { CFG } from './config.js';

const BEST_KEY = 'star-garden-rumble/best';
const loadBest = () => {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
};

const fresh = () => ({ score: 0, combo: 0, hp: CFG.crystal.hp, wave: 1, kills: 0, over: false });

export const store = createStore((set, get) => ({
  ...fresh(),
  best: loadBest(),

  reset: () => set(fresh()),
  addScore: (n) => {
    const score = get().score + n;
    const best = Math.max(score, get().best);
    if (best !== get().best) { try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* 無痕模式 */ } }
    set({ score, best });
  },
  bumpCombo: () => { const combo = get().combo + 1; set({ combo }); return combo; },
  resetCombo: () => get().combo && set({ combo: 0 }),
  addKill: () => set({ kills: get().kills + 1 }),
  setWave: (wave) => wave !== get().wave && set({ wave }),
  damageCrystal: () => {
    const hp = Math.max(0, get().hp - 1);
    set({ hp, over: hp === 0 });
    return hp;
  },
}));
