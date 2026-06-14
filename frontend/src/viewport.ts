// Drive mobile layout from the *visual* viewport rather than the layout
// viewport. `vh`/`dvh` units don't shrink when the on-screen keyboard opens -
// only the visual viewport does - so without this the keyboard overlays fixed
// content (e.g. the chat input ends up hidden behind it).
//
// Exposes:
//   --vvh            the current visible height in px (use as `var(--vvh, 100dvh)`)
//   html.keyboard-open  toggled while the on-screen keyboard is open
const root = document.documentElement;
const vv = window.visualViewport;

// A keyboard typically occludes far more than a URL bar; this threshold avoids
// treating URL-bar show/hide (which moves the layout viewport too, so it mostly
// cancels out) as a keyboard.
const KEYBOARD_THRESHOLD = 150;

function update() {
  if (!vv) return;
  root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  const occluded = window.innerHeight - vv.height;
  root.classList.toggle('keyboard-open', occluded > KEYBOARD_THRESHOLD);
}

if (vv) {
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
// If visualViewport is unsupported we simply never set --vvh, and the CSS falls
// back to its `100dvh` default.
