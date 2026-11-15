# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/slothanabot/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/slothanabot/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

HILLBREAK — Dustline Yard: a three.js tactical FPS. Hold the hill, break the Ember squad, win 2 rounds. Open-arena capture-point combat with bot squads in distinct roles, three buyable weapons plus a frag grenade, and a buy phase between rounds.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 and click to play. No build step, no network — static files under `game/` with three.js 0.187.0 vendored.

## How it plays

- **Capture the hill**: stand on the central platform to bank points for your team — first to 100 takes the round, first to 2 rounds takes the match. Contested means nobody scores.
- **Two squads**: you plus two Vanguard teammates (Rook the rusher, Mira the support) against four Ember bots — rushers who push the hill, a sniper holding the long sightlines, and a support who heals allies.
- **Buy phase**: $800 to start, $300 a kill, $1,400 a round win. Spend it on the K-9 Ripper SMG, the VK-7 Carbine rifle, the L-88 Longshot marksman (right-click to scope), frag grenades (G to throw), or kevlar.
- **Gunplay that rewards stopping to aim**: hitscan with headshot damage, recoil and spread that grow while moving, crouching for a tighter cone, and AABB collision with the map.
- **Bots that play the map**: waypoint routes through the lanes, hold positions, react to gunfire, strafe while engaging, and fall back when hurt.

## Controls

WASD move · mouse look · click fire · right-click scope (Longshot) · R reload · G grenade · Ctrl crouch · Space jump · 1–4 / G / V buy during the buy phase · Enter deploy.

---

<sub>Entered on [make.fun](https://make.fun/?ref=x15bjha9&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
