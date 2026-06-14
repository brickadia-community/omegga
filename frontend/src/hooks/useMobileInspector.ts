import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from 'react';
import { useLocation } from 'wouter';

const SWIPE_THRESHOLD = 80;
// a hair longer than the inspector slide transition (0.25s) in
// _inspector-mobile.scss, so the slide-out finishes before we unmount the panel
const CLOSE_ANIM_MS = 290;

// Walking up from the touch target to the swipe container, return true if the
// gesture began inside a horizontally-scrollable element that still has content
// to its left (scrollLeft > 0). A dismiss is a left-to-right swipe, which is the
// same gesture that scrolls such an element back toward its start - so when the
// element can still scroll that way (e.g. the owners table in the worlds
// inspector), the swipe belongs to it, not to the dismiss.
function startedInHorizontalScroll(
  target: EventTarget | null,
  container: Element,
): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== container) {
    if (el.scrollLeft > 0 && el.scrollWidth > el.clientWidth) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Drives the mobile "inspector overlay" pattern for the list+inspector views.
 *
 * On mobile the inspector slides in from the right when an item is selected.
 * - `onBack` (passed to NavHeader) and a left-to-right swipe both dismiss it.
 *   (A horizontal swipe avoids colliding with vertical scrolling / the browser
 *   pull-to-refresh gesture.)
 * - `swipeHandlers` go on the outer container.
 * - `inspectorOpen` is the class toggle: it drops to false the moment a dismiss
 *   starts (so the panel transitions out) while we keep the route - and thus the
 *   panel - mounted for the slide-out, then navigate. The players/users/roles
 *   inspectors are <Switch>-mounted, so navigating first would unmount the panel
 *   before it could animate.
 *
 * `open` is purely route-derived, so the browser back button works too.
 */
export function useMobileInspector(open: boolean, listRoute: string) {
  const [, navigate] = useLocation();
  const [closing, setClosing] = useState(false);

  const openRef = useRef(open);
  openRef.current = open;
  const closingRef = useRef(closing);
  closingRef.current = closing;

  const timer = useRef<ReturnType<typeof setTimeout>>();

  const close = useCallback(() => {
    if (!openRef.current || closingRef.current) return;
    setClosing(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(listRoute), CLOSE_ANIM_MS);
  }, [navigate, listRoute]);

  // reset once the route has actually changed
  useEffect(() => {
    if (!open) setClosing(false);
  }, [open]);

  // don't let a pending close navigate after the view unmounts (e.g. the user
  // taps a nav item mid-animation) or stomp a newer navigation
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (
      !openRef.current ||
      closingRef.current ||
      // let a horizontally-scrolled element (e.g. a wide table) keep the gesture
      startedInHorizontalScroll(e.target, e.currentTarget)
    ) {
      start.current = null;
      return;
    }
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = Math.abs(t.clientY - s.y);
      // swipe left-to-right (predominantly horizontal) to dismiss
      if (dx > SWIPE_THRESHOLD && dx > dy) close();
    },
    [close],
  );

  return {
    onBack: open ? close : undefined,
    swipeHandlers: { onTouchStart, onTouchEnd },
    inspectorOpen: open && !closing,
  };
}
