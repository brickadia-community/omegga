let mouseX = -1;
let mouseY = -1;
let tooltipVisible = false;
let showTooltip: boolean, tooltipHideTimeout: ReturnType<typeof setTimeout>;

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
  zIndex: '100000',
  borderRadius: '8px',
  pointerEvents: 'none',
  opacity: 0,
  transition: 'opacity .2s ease',
});
tooltipElem.innerText = '';

// add it to the dom
document.body.appendChild(tooltipElem);

// update mouse position when mouse moves
document.body.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (showTooltip) updateTooltipPos();
});

// set the tooltip position to the last mouse position;
function updateTooltipPos() {
  const width = document.body.clientWidth;
  const height = document.body.clientHeight;
  Object.assign(tooltipElem.style, {
    left:
      mouseX + (mouseX < width / 2 ? 16 : -16 - tooltipElem.clientWidth) + 'px',
    top:
      mouseY +
      (mouseY < height / 2 ? 16 : -16 - tooltipElem.clientHeight) +
      'px',
  });
}

// recurse up the doc tree to find a tooltip
function getTooltipFromElem(e: Element | null) {
  if (!e || !e.getAttribute) return;
  const tooltip = e.getAttribute('data-tooltip');
  if (tooltip) return tooltip;
  return getTooltipFromElem((e.parentNode as Element) ?? null);
}

function checkHoverElem() {
  // find the element under the mouse
  const elem = document.elementFromPoint(mouseX, mouseY);

  // get the tooltip from it
  const tooltip = getTooltipFromElem(elem);
  const currText = tooltipElem.innerText;

  // kill the tooltip cooldown if there's
  if (!tooltip && tooltipVisible && !showTooltip) {
    tooltipVisible = false;
    clearTimeout(tooltipHideTimeout);
  }

  // if there's a tooltip - show the popup
  if (tooltip && !tooltipVisible && !showTooltip) {
    clearTimeout(tooltipHideTimeout);

    tooltipVisible = true;

    // wait a little before showing the tooltip
    tooltipHideTimeout = setTimeout(() => {
      tooltipElem.innerText = tooltip;
      updateTooltipPos();
      tooltipElem.style.opacity = '1';
      showTooltip = true;
    }, 400);

    // otherwise, hide it
  } else if (currText !== tooltip && showTooltip && tooltipVisible) {
    clearTimeout(tooltipHideTimeout);
    tooltipVisible = false;

    // delay the hide by 300ms (longer than the transition)
    tooltipHideTimeout = setTimeout(() => {
      showTooltip = false;
      Object.assign(tooltipElem.style, {
        left: '-1000px',
        top: '-1000px',
      });
    }, 300);

    // start 0 opacity transition
    tooltipElem.style.opacity = '0';
  }
}

// repeatedly check tooltip
setInterval(() => {
  checkHoverElem();
}, 100);
