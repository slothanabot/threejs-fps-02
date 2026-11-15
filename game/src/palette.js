// The look plan, in one place. Dustline Yard at dusk: warm sand and rust against a cool
// teal dusk sky, with one hot amber accent for the hill beacon and the HUD. The same six
// names are the CSS custom properties in index.html, so the page and the scene agree.
export const PALETTE = {
  canvas: '#1a1d22', // dusk sky / page background
  surface: '#2b2f36', // concrete, dark metal
  hairline: '#4a4238', // sandstone shadow
  ink: '#e8e2d4', // warm off-white (player team, HUD text)
  muted: '#8b98a0', // cool grey-blue (distant detail)
  accent: '#f0a830', // amber (hill beacon, enemy team is rust, not amber)
  rust: '#c65a2e', // enemy team colour
  teal: '#2e7f86', // player team colour
  sand: '#b99c6e', // arena floor
};

export function shade(name) {
  return PALETTE[name];
}
