import { useSyncExternalStore } from "react";
import { getInstitutionCorrectionRequests, getUnreadNotificationCount } from "@/lib/api";

/** How often a live count is refreshed while the tab is visible and in use. */
export const LIVE_COUNT_INTERVAL_MS = 120_000;
/** Polling stops after this long without any mouse, key or touch input, and resumes on the next one. */
export const LIVE_COUNT_IDLE_AFTER_MS = 10 * 60_000;

/** Input that shows someone is using the page. */
const INTERACTION_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

/**
 * A number shown in the app shell (unread notifications, pending correction requests), shared by every component
 * of this tab that shows it, with one poller per count running only while something on the page shows it.
 *
 * To spare the database, it polls only while the tab is visible and in use: hiding the tab stops the poller
 * (showing it again checks at once and restarts it), and 10 minutes without mouse, key or touch input stop it
 * until the next input (which also checks at once). Regaining focus always checks. A failed refresh keeps the
 * last value; nothing is ever retried in a loop.
 */
function createLiveCount(fetchCount: () => Promise<number>) {
  let count = 0;
  let timer: number | undefined;
  let inFlight: Promise<void> | null = null;
  let lastInteraction = 0;
  let idle = false;
  const listeners = new Set<() => void>();

  function set(next: number) {
    const value = Math.max(0, Math.floor(next));
    if (value === count) return;
    count = value;
    listeners.forEach((listener) => listener());
  }

  function refresh() {
    inFlight ??= fetchCount()
      .then(set, () => undefined)
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  function startTimer() {
    if (timer !== undefined || document.hidden || idle) return;
    timer = window.setInterval(tick, LIVE_COUNT_INTERVAL_MS);
  }

  function stopTimer() {
    window.clearInterval(timer);
    timer = undefined;
  }

  function tick() {
    if (document.hidden) {
      stopTimer();
      return;
    }
    if (Date.now() - lastInteraction >= LIVE_COUNT_IDLE_AFTER_MS) {
      // Nobody has used the page for a while: stop until the next input.
      idle = true;
      stopTimer();
      return;
    }
    void refresh();
  }

  /** The user is here again: check now and keep polling. */
  function resume() {
    lastInteraction = Date.now();
    idle = false;
    if (document.hidden) return;
    void refresh();
    startTimer();
  }

  // Input events come often: they only note the time, unless polling had stopped for inactivity.
  const onInteraction = () => {
    if (idle) resume();
    else lastInteraction = Date.now();
  };
  const onFocus = () => resume();
  const onVisibility = () => {
    if (document.hidden) stopTimer();
    else resume();
  };

  function start() {
    resume();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    for (const type of INTERACTION_EVENTS) window.addEventListener(type, onInteraction, { capture: true, passive: true });
  }

  function stop() {
    stopTimer();
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const type of INTERACTION_EVENTS) window.removeEventListener(type, onInteraction, { capture: true });
    // Another account may sign in to this tab next.
    count = 0;
    idle = false;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  }

  return {
    /** The current count; subscribing starts the poller. */
    useCount: () => useSyncExternalStore(subscribe, () => count, () => 0),
    refresh,
    set,
    adjust: (delta: number) => set(count + delta),
  };
}

/** The signed-in user's unread notifications (students and institutions). */
export const unreadNotifications = createLiveCount(() => getUnreadNotificationCount().then((response) => response.unreadCount));

/** The institution's correction requests waiting for a decision. */
export const pendingCorrections = createLiveCount(() =>
  getInstitutionCorrectionRequests({ status: "pending", limit: 1 }).then((response) => response.pendingCount));
