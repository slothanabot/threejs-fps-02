// Weapons and the buy menu's catalogue. Four guns with different range, damage and
// fire-rate, plus a frag grenade and a kevlar vest. The numbers live here; main.js owns
// the ray and the damage, bots.js owns bot fire discipline.
//
// Spread punishes firing on the move: a still, crouched shot is tight, a sprinting spray
// is not. Recoil kicks the view up and recovers; holding the trigger walks the aim.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, auto: false, mag: 12, reserve: 36,
    gap: 0.16, reload: 1.1, damage: 26, headMult: 2.0, spreadStill: 0.004, spreadMove: 0.02,
    recoil: 0.006, range: 45, kick: 0.03,
  },
  smg: {
    id: 'smg', name: 'K-9 Ripper', price: 700, auto: true, mag: 32, reserve: 96,
    gap: 0.075, reload: 1.6, damage: 22, headMult: 2.0, spreadStill: 0.008, spreadMove: 0.034,
    recoil: 0.007, range: 38, kick: 0.035,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', price: 900, auto: true, mag: 30, reserve: 90,
    gap: 0.096, reload: 1.9, damage: 34, headMult: 2.0, spreadStill: 0.0022, spreadMove: 0.028,
    recoil: 0.009, range: 70, kick: 0.055,
  },
  marksman: {
    id: 'marksman', name: 'L-88 Longshot', price: 1500, auto: false, mag: 8, reserve: 24,
    gap: 0.85, reload: 2.6, damage: 85, headMult: 2.0, spreadStill: 0.0006, spreadMove: 0.05,
    recoil: 0.03, range: 90, kick: 0.09, scoped: true,
  },
};
export const GRENADE_PRICE = 300;
export const VEST_PRICE = 400;
export const GRENADE_MAX = 2;

const GRENADE_FUSE = 1.6;
const GRENADE_RADIUS = 7;
const GRENADE_DAMAGE = 110;

export function createWeapon(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });

  // One view model, rebuilt from boxes when the weapon changes: a receiver, a barrel and
  // a stock whose lengths say rifle, SMG or marksman at a glance. Kept small and low so
  // it reads as a gun in the hand, not a plank across the screen.
  const model = new THREE.Group();
  model.position.set(0.26, -0.24, -0.5);
  model.scale.setScalar(0.75);
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.22, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.2, -0.7);
  camera.add(flashLight);

  const state = {
    id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0, scoped: false,
  };

  function rebuildModel() {
    while (model.children.length) model.remove(model.children[0]);
    const def = WEAPONS[state.id];
    const barrelLen = state.id === 'marksman' ? 0.62 : state.id === 'smg' ? 0.28 : 0.4;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, barrelLen), gripMat);
    barrel.position.set(0, 0.025, -0.21 - barrelLen / 2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), gripMat);
    stock.position.set(0, -0.02, 0.3);
    model.add(receiver, barrel, stock);
    if (state.id === 'marksman') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), darkMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      model.add(scope);
    }
    if (state.id === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), darkMat);
      mag.position.set(0, -0.13, -0.08);
      model.add(mag);
    }
  }
  rebuildModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.5 + state.kick;
    model.position.x = state.scoped ? 0 : 0.26;
    model.position.y = state.scoped ? -0.19 : -0.24;
    model.rotation.x = state.kick * 2.2;
    model.visible = true;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (WEAPONS[state.id].reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const def = WEAPONS[state.id];
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    def() { return WEAPONS[state.id]; },
    equip(id) {
      const def = WEAPONS[id];
      if (!def) return false;
      state.id = id;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.scoped = false;
      rebuildModel();
      return true;
    },
    refill() {
      const def = WEAPONS[state.id];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[state.id].gap;
      state.flash = 0.06;
      state.kick = WEAPONS[state.id].kick;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.id];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed, crouching) {
      const def = WEAPONS[state.id];
      const move = Math.min(1, speed / 5.4);
      let spread = def.spreadStill + move * def.spreadMove;
      if (crouching) spread *= 0.7;
      if (state.scoped) spread *= 0.45;
      return spread;
    },
  };
}

// A thrown frag: gravity, one bounce off the floor, a fuse, then an explosion that
// damages every fighter inside the radius with falloff. main.js steps it and asks
// damageAt() when the fuse burns out.
export function createGrenade(origin, direction, colliders) {
  const position = origin.clone();
  const velocity = direction.clone().multiplyScalar(13);
  velocity.y += 3.2;
  const probe = new THREE.Box3();
  return {
    position,
    fuse: GRENADE_FUSE,
    done: false,
    step(dt) {
      velocity.y -= 14 * dt;
      position.addScaledVector(velocity, dt);
      if (position.y < 0.12) {
        position.y = 0.12;
        velocity.y = Math.abs(velocity.y) * 0.35;
        velocity.x *= 0.7;
        velocity.z *= 0.7;
      }
      for (const c of colliders) {
        probe.min.set(position.x - 0.12, position.y - 0.12, position.z - 0.12);
        probe.max.set(position.x + 0.12, position.y + 0.12, position.z + 0.12);
        if (probe.intersectsBox(c)) {
          // Simple push-out: stop the grenade against the wall it hit.
          velocity.multiplyScalar(0.2);
          position.addScaledVector(velocity, -dt);
          break;
        }
      }
      this.fuse -= dt;
      if (this.fuse <= 0) this.done = true;
    },
    damageAt(point) {
      const d = point.distanceTo(position);
      if (d > GRENADE_RADIUS) return 0;
      return Math.round(GRENADE_DAMAGE * (1 - d / GRENADE_RADIUS) + 15);
    },
  };
}
