"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "@/lib/api";
import { unreadNotifications } from "@/lib/liveCounts";
import { notificationHref, notificationTime, type NotificationRole } from "@/lib/notificationLinks";

const PANEL_WIDTH = 380;
const LATEST = 10;

interface PanelPosition {
  top: number;
  left: number;
  width: number;
  /** The page it was opened on: changing page closes it. */
  path: string;
}

/**
 * The bell in the app shell, with the unread count. It opens a panel with the latest notifications; clicking one
 * marks it read and goes to what it concerns. The count itself is polled by the shared live count.
 */
export function NotificationBell({ role, placement }: { role: NotificationRole; placement: "sidebar" | "topbar" }) {
  const count = unreadNotifications.useCount();
  const router = useRouter();
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState("");
  const open = position !== null && position.path === pathname;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setPosition(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPosition(null);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function load() {
    setError("");
    try {
      const response = await getNotifications({ limit: LATEST });
      setItems(response.notifications);
      unreadNotifications.set(response.unreadCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Notifications could not be loaded.");
    }
  }

  function toggle() {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current!.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
    // Beside the sidebar on wide screens; under the top bar, against the right edge, on small ones.
    const left = placement === "sidebar" ? Math.min(rect.right + 8, window.innerWidth - width - 8) : Math.max(8, window.innerWidth - width - 8);
    const top = placement === "sidebar" ? Math.max(8, rect.top) : rect.bottom + 8;
    setPosition({ top, left, width, path: pathname });
    setItems(null);
    void load();
  }

  async function openItem(item: AppNotification) {
    setPosition(null);
    if (!item.isRead) {
      unreadNotifications.adjust(-1);
      try {
        await markNotificationRead(item.id);
      } catch {
        void unreadNotifications.refresh();
      }
    }
    router.push(notificationHref(role, item));
  }

  async function markAll() {
    setError("");
    try {
      await markAllNotificationsRead();
      unreadNotifications.set(0);
      setItems((current) => current?.map((item) => ({ ...item, isRead: true })) ?? current);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "The notifications could not be marked as read.");
    }
  }

  const hasUnread = Boolean(items?.some((item) => !item.isRead)) || count > 0;

  return (
    <>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-teal-600"
        data-notification-bell={placement}
        onClick={toggle}
        ref={buttonRef}
        type="button"
      >
        <Bell aria-hidden="true" className="size-5" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white" data-unread-badge="">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          aria-label="Notifications"
          className="fixed z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-xl"
          data-notification-panel=""
          id={panelId}
          ref={panelRef}
          role="dialog"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:text-slate-400 disabled:hover:bg-transparent"
              disabled={!hasUnread}
              onClick={() => void markAll()}
              type="button"
            >
              <CheckCheck aria-hidden="true" className="size-4" />
              Mark all as read
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <p className="px-4 py-4 text-sm text-red-700" role="alert">{error}</p>
            ) : items === null ? (
              <p className="px-4 py-4 text-sm text-slate-500" role="status">Loading notifications...</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">You have no notifications yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      className={`flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50 ${item.isRead ? "text-slate-600" : "text-slate-900"}`}
                      data-notification-item={item.id}
                      onClick={() => void openItem(item)}
                      type="button"
                    >
                      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-teal-600"}`} />
                      <span className="min-w-0">
                        <span className={`block break-words ${item.isRead ? "" : "font-semibold"}`}>{item.message}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {notificationTime(item.createdAt)}
                          {!item.isRead && <span className="sr-only"> (unread)</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-slate-200 px-4 py-2.5 text-right">
            <Link className="text-sm font-semibold text-teal-700 hover:text-teal-900" href={`/${role}/notifications`} onClick={() => setPosition(null)}>View all</Link>
          </div>
        </div>
      )}
    </>
  );
}
