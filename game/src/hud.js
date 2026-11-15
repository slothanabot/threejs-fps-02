// The DOM HUD: crosshair, hit marker, health, ammo, money, the capture bar, the round
// timer, the kill feed, the buy menu and the overlay panels. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out. DOM writes are cached
// so a value that did not change costs no layout.
import { WEAPONS, GRENADE_PRICE, VEST_PRICE } from './weapons.js';
import { CAPTURE_TARGET } from './state.js';

const BUY_ITEMS = [
  { key: '1', id: 'pistol', label: 'P9 Sidearm', desc: 'Free · 12 rounds · reliable' },
  { key: '2', id: 'smg', label: 'K-9 Ripper', desc: '$700 · fast · close range' },
  { key: '3', id: 'rifle', label: 'VK-7 Carbine', desc: '$900 · all-round rifle' },
  { key: '4', id: 'marksman', label: 'L-88 Longshot', desc: '$1,500 · one-shot punch · right-click scope' },
  { key: 'G', id: 'grenade', label: 'Frag grenade', desc: `$${GRENADE_PRICE} · throw with G in the fight` },
  { key: 'V', id: 'vest', label: 'Kevlar vest', desc: `$${VEST_PRICE} · +50 armour` },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'), play: $('play'),
    buyPanel: $('buy-panel'), buyMoney: $('buy-money'), buyList: $('buy-list'),
    healthFill: $('health-fill'), healthNum: $('health-num'), armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    weaponName: $('weapon-name'), money: $('money'), grenades: $('grenades'),
    capVanguard: $('cap-vanguard'), capEmber: $('cap-ember'), capLabel: $('cap-label'),
    timer: $('timer'), rounds: $('rounds'), feed: $('feed'), banner: $('banner'),
    bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    hitmarker: $('hitmarker'), crosshair: $('crosshair'), teamList: $('team-list'),
    vignette: $('vignette'), score: $('score-value'),
  };
  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function buildBuyList(onBuy) {
    els.buyList.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.id = item.id;
      button.innerHTML = `<b>[${item.key}] ${item.label}</b><span>${item.desc}</span>`;
      button.addEventListener('click', () => onBuy(item.id));
      els.buyList.appendChild(button);
    }
  }

  return {
    setHealth(health, armor) {
      setText(els.healthNum, 'hp', String(Math.ceil(health)));
      setText(els.armorNum, 'armor', armor > 0 ? `+${Math.ceil(armor)} armour` : '');
      const pct = Math.max(0, health);
      if (last.hpPct !== pct) {
        last.hpPct = pct;
        els.healthFill.style.width = `${pct}%`;
        els.healthFill.classList.toggle('low', pct <= 30);
      }
    },
    setAmmo(mag, reserve) {
      setText(els.ammoMag, 'mag', String(mag));
      setText(els.ammoReserve, 'reserve', `/ ${reserve}`);
      els.ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name, grenades) {
      setText(els.weaponName, 'weapon', name);
      setText(els.grenades, 'nades', grenades > 0 ? `◉ ${grenades}` : '');
    },
    setMoney(money) {
      const shown = `$${Math.floor(money)}`;
      setText(els.money, 'money', shown);
      setText(els.buyMoney, 'buyMoney', shown);
    },
    setCapture(vanguard, ember, holder, contested) {
      const vPct = Math.min(100, (vanguard / CAPTURE_TARGET) * 100);
      const ePct = Math.min(100, (ember / CAPTURE_TARGET) * 100);
      if (last.vPct !== vPct) { last.vPct = vPct; els.capVanguard.style.width = `${vPct}%`; }
      if (last.ePct !== ePct) { last.ePct = ePct; els.capEmber.style.width = `${ePct}%`; }
      const label = contested ? 'CONTESTED' : holder === 'vanguard' ? 'VANGUARD HOLDING' : holder === 'ember' ? 'EMBER HOLDING' : 'HILL OPEN';
      setText(els.capLabel, 'capLabel', `${label} · ${Math.floor(vanguard)} — ${Math.floor(ember)}`);
      els.capLabel.classList.toggle('contested', contested);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(els.timer, 'timer', phase === 'buy' ? `BUY ${s}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      els.timer.classList.toggle('buy', phase === 'buy');
    },
    setRounds(vanguard, ember, round) {
      setText(els.rounds, 'rounds', `ROUND ${round} · VANGUARD ${vanguard} — ${ember} EMBER`);
    },
    setScore(kills, deaths) {
      setText(els.score, 'score', `${kills} kills · ${deaths} deaths`);
    },
    setTeamList(entries) {
      // entries: [{ name, team, alive, health }]
      const key = entries.map((e) => `${e.name}:${e.alive ? Math.round(e.health) : 'x'}`).join('|');
      if (last.teamKey === key) return;
      last.teamKey = key;
      els.teamList.innerHTML = entries.map((e) =>
        `<li class="${e.team} ${e.alive ? '' : 'dead'}">${e.name} ${e.alive ? Math.round(e.health) : '✕'}</li>`).join('');
    },
    pushFeed(items) {
      const key = items.map((i) => i.text).join('|');
      if (last.feedKey === key) return;
      last.feedKey = key;
      els.feed.innerHTML = items.map((i) =>
        `<li class="${i.team ?? ''}">${i.text}</li>`).join('');
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    setCrosshairGap(px) {
      if (last.gap !== px) {
        last.gap = px;
        els.crosshair.style.setProperty('--gap', `${px}px`);
      }
    },
    damageFlash() {
      els.vignette.classList.remove('flash');
      void els.vignette.offsetWidth;
      els.vignette.classList.add('flash');
    },
    showBanner(title, sub, holdMs = 2600) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('on'), holdMs);
    },
    showBuy(show) {
      els.buyPanel.hidden = !show;
    },
    buildBuyList,
    setBuyAfford(money, ownedWeapon) {
      for (const button of els.buyList.children) {
        const item = BUY_ITEMS.find((i) => i.id === button.dataset.id);
        const price = item.id === 'grenade' ? GRENADE_PRICE : item.id === 'vest' ? VEST_PRICE : WEAPONS[item.id].price;
        const owned = item.id === ownedWeapon;
        button.classList.toggle('cant', !owned && money < price);
        button.classList.toggle('owned', owned);
      }
    },
    showOverlay(mode, data = {}) {
      const copy = {
        start: ['HILLBREAK', 'Dustline Yard — hold the hill, break the Ember squad. First to 100 capture points takes the round; first to 2 rounds takes the match.', 'Click to play'],
        paused: ['HILLBREAK', 'Paused. Click to resume.', 'Click to resume'],
        round: [data.title ?? 'Round over', data.copy ?? '', 'Next round'],
        match: [data.title ?? 'Match over', data.copy ?? '', 'Play again'],
      }[mode];
      els.title.textContent = copy[0];
      els.copy.textContent = copy[1];
      els.play.textContent = copy[2];
      els.overlay.hidden = false;
      els.play.focus();
    },
    hideOverlay() { els.overlay.hidden = true; },
    onPlay(handler) { els.play.addEventListener('click', handler); },
  };
}
