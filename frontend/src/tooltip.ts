let mouseX = -1;
let mouseY = -1;

// the tooltip element is currently faded in
let visible = false;
// text that is currently shown or pending a show; null when hidden/hiding
let currentText: string | null = null;
let showTimeout: ReturnType<typeof setTimeout> | undefined;
let hideTimeout: ReturnType<typeof setTimeout> | undefined;

// When the last interaction was touch we disable the mouse-hover polling so the
// synthetic mouse events the browser fires after a tap can't resurrect a
// tooltip that would then be stuck on screen with no cursor to move it away.
let lastInputWasTouch = false;
// Ignore mouse events until this timestamp - covers the burst of synthetic
// mouse events dispatched right after a touch ends.
let suppressMouseUntil = 0;

const HOVER_SHOW_DELAY = 400;
const TOUCH_SHOW_DELAY = 300;
const HIDE_DELAY = 300;
const TOUCH_SUPPRESS_MS = 700;

// create the tooltip element
const tooltipElem = document.createElement('div');
Object.assign(tooltipElem.style, {
  position: 'fixed',
  left: '-1000px',
  top: '-1000px',
  border: '2px solid black',
  background: 'white',
  fontFamily: 'Glacial Indifference',
  fontWeight: 'bold',
  fontSize: '16px',
  padding: '8px',
  maxWidth: '300px',
  overflowWrap: 'anywhere',
  zIndex: '100000',
  borderRadius: '8px',
  pointerEvents: 'none',
  opacity: 0,
  transition: 'opacity .2s ease',
});
tooltipElem.innerText = '';

// add it to the dom
document.body.appendChild(tooltipElem);

const VIEWPORT_MARGIN = 8;

// position the tooltip near the given point, keeping it fully within the
// viewport (clamped on all sides so it never runs off screen)
function positionTooltip(x: number, y: number) {
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  // cap the width so it always fits narrow (mobile) screens and wraps instead
  // of overflowing
  tooltipElem.style.maxWidth =
    Math.min(300, width - VIEWPORT_MARGIN * 2) + 'px';
  const w = tooltipElem.clientWidth;
  const h = tooltipElem.clientHeight;
  const left = x + (x < width / 2 ? 16 : -16 - w);
  const top = y + (y < height / 2 ? 16 : -16 - h);
  Object.assign(tooltipElem.style, {
    left:
      Math.max(VIEWPORT_MARGIN, Math.min(left, width - w - VIEWPORT_MARGIN)) +
      'px',
    top:
      Math.max(VIEWPORT_MARGIN, Math.min(top, height - h - VIEWPORT_MARGIN)) +
      'px',
  });
}

// recurse up the doc tree to find a tooltip
function getTooltipFromElem(e: Element | null): string | undefined {
  if (!e || !e.getAttribute) return;
  const tooltip = e.getAttribute('data-tooltip');
  if (tooltip) return tooltip;
  return getTooltipFromElem((e.parentNode as Element) ?? null);
}

function showTooltip(text: string, x: number, y: number, delay: number) {
  clearTimeout(hideTimeout);
  // already showing this text - just keep it positioned
  if (visible && currentText === text) {
    positionTooltip(x, y);
    return;
  }
  // already pending the same text - don't reset the timer
  if (currentText === text) return;

  clearTimeout(showTimeout);
  currentText = text;
  showTimeout = setTimeout(() => {
    tooltipElem.innerText = text;
    positionTooltip(x, y);
    tooltipElem.style.opacity = '1';
    visible = true;
  }, delay);
}

function hideTooltip() {
  clearTimeout(showTimeout);
  if (currentText === null) return;
  currentText = null;
  tooltipElem.style.opacity = '0';
  clearTimeout(hideTimeout);
  // delay the move-offscreen until after the fade transition
  hideTimeout = setTimeout(() => {
    visible = false;
    Object.assign(tooltipElem.style, { left: '-1000px', top: '-1000px' });
  }, HIDE_DELAY);
}

// update mouse position when the (real) mouse moves
document.body.addEventListener('mousemove', e => {
  if (Date.now() < suppressMouseUntil) return;
  lastInputWasTouch = false;
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (visible) positionTooltip(mouseX, mouseY);
});

// poll the element under the cursor to drive hover tooltips
function checkHoverElem() {
  if (lastInputWasTouch || Date.now() < suppressMouseUntil) return;
  const elem = document.elementFromPoint(mouseX, mouseY);
  const tooltip = getTooltipFromElem(elem);
  if (tooltip) showTooltip(tooltip, mouseX, mouseY, HOVER_SHOW_DELAY);
  else hideTooltip();
}

// On touch, only show a tooltip while the finger is held down on an element,
// and hide it as soon as the touch ends or turns into a scroll/swipe.
document.body.addEventListener(
  'touchstart',
  e => {
    lastInputWasTouch = true;
    const touch = e.touches[0];
    if (!touch) return;
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const tooltip = getTooltipFromElem(elem);
    if (tooltip)
      showTooltip(tooltip, touch.clientX, touch.clientY, TOUCH_SHOW_DELAY);
    else hideTooltip();
  },
  { passive: true },
);

// a swipe/scroll cancels the pending or visible tooltip
document.body.addEventListener('touchmove', () => hideTooltip(), {
  passive: true,
});

function endTouch() {
  suppressMouseUntil = Date.now() + TOUCH_SUPPRESS_MS;
  hideTooltip();
}
document.body.addEventListener('touchend', endTouch);
document.body.addEventListener('touchcancel', endTouch);

// repeatedly check tooltip
setInterval(checkHoverElem, 100);
