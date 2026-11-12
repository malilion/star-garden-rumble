import { store } from './store.js';
import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);
const pop = (el) => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };

export function initHud(onRestart) {
  const els = { score: $('score'), best: $('best'), wave: $('wave'), hp: $('hp'), combo: $('combo'), bar: $('combo-bar'), overlay: $('overlay') };

  const render = (s, prev = {}) => {
    if (s.score !== prev.score) { els.score.textContent = s.score; if (prev.score !== undefined && s.score > prev.score) pop(els.score); }
    if (s.best !== prev.best) els.best.textContent = s.best;
    if (s.wave !== prev.wave) els.wave.textContent = s.wave;
    if (s.hp !== prev.hp) {
      els.hp.innerHTML = Array.from({ length: CFG.crystal.hp }, (_, i) => `<span class="${i < s.hp ? '' : 'lost'}">◆</span>`).join('');
    }
    if (s.combo !== prev.combo) {
      els.combo.textContent = `x${Math.max(1, s.combo)}`;
      els.combo.classList.toggle('idle', s.combo === 0);
      if (s.combo > 0) pop(els.combo);
    }
    if (s.over !== prev.over) {
      els.overlay.hidden = !s.over;
      if (s.over) {
        $('final-score').textContent = s.score;
        $('final-kills').textContent = s.kills;
        $('final-wave').textContent = s.wave;
      }
    }
  };
  render(store.getState());
  store.subscribe(render);
  $('restart').addEventListener('click', onRestart);

  return {
    setComboFrac: (f) => { els.bar.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`; },
    hideHint: () => $('hint').classList.add('gone'),
  };
}
