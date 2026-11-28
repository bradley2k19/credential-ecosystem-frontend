"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "@/lib/api";
import { unreadNotifications } from "@/lib/liveCounts";
import { notificationHref, notificationTime, type NotificationRole } from "@/lib/notificationLinks";

const PAGE_SIZE = 20;

/** Every notification of the signed-in student or institution, newest first, with an unread filter and paging. */
export function NotificationsPage({ role }: { role: NotificationRole }) {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void getNotifications({ page, limit: PAGE_SIZE, unreadOnly })
      .then((response) => {
        if (!active) return;
        setNotifications(response.notifications);
        setTotalPages(Math.max(response.pagination.totalPages, 1));
        setUnreadCount(response.unreadCount);
        unreadNotifications.set(response.unreadCount);
      })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Your notifications could not be loaded."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [page, unreadOnly, reloadKey]);

  function reload(changes: { page?: number; unreadOnly?: boolean } = {}) {
    setIsLoading(true);
    setError("");
    if (changes.page !== undefined) setPage(changes.page);
    if (changes.unreadOnly !== undefined) setUnreadOnly(changes.unreadOnly);
    setReloadKey((key) => key + 1);
  }

  async function markRead(item: AppNotification) {
    try {
      await markNotificationRead(item.id);
      setNotifications((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
      setUnreadCount((count) => Math.max(0, count - 1));
      unreadNotifications.adjust(-1);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "The notification could not be marked as read.");
    }
  }

  async function open(item: AppNotification) {
    if (!item.isRead) await markRead(item);
    router.push(notificationHref(role, item));
  }

  async function markAll() {
    setError("");
    try {
      await markAllNotificationsRead();
      unreadNotifications.set(0);
      if (unreadOnly) reload({ page: 1 });
      else {
        setNotifications((current) => current.map((entry) => ({ ...entry, isRead: true })));
        setUnreadCount(0);
      }
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "The notifications could not be marked as read.");
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">{role === "student" ? "Student workspace" : "Institution workspace"}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Notifications</h1>
          <p className="mt-2 text-slate-600">{unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up."}</p>
        </div>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          disabled={unreadCount === 0}
          onClick={() => void markAll()}
          type="button"
        >
          Mark all as read
        </button>
      </div>

      <div aria-label="Show" className="mt-6 inline-flex rounded-md border border-slate-300 p-0.5 text-sm" role="group">
        {[{ label: "All", value: false }, { label: "Unread", value: true }].map((option) => (
          <button
            aria-pressed={unreadOnly === option.value}
            className={`rounded px-3 py-1.5 font-semibold ${unreadOnly === option.value ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-50"}`}
            key={option.label}
            onClick={() => reload({ page: 1, unreadOnly: option.value })}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {isLoading ? (
        <p className="mt-6 text-sm text-slate-600" role="status">Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <p className="mt-6 rounded-md bg-slate-50 p-6 text-center text-sm text-slate-600" data-notifications-empty="">
          {unreadOnly ? "No unread notifications." : "You have no notifications yet. They appear here when your certificates are issued, revoked, verified or corrected."}
        </p>
      ) : (
        <>
          <ul className="mt-6 divide-y divide-slate-200 rounded-md border border-slate-200" data-notifications-list="">
            {notifications.map((item) => (
              <li className={`flex flex-wrap items-start gap-3 px-4 py-3 ${item.isRead ? "" : "bg-teal-50/40"}`} data-notification-row={item.id} key={item.id}>
                <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-teal-600"}`} />
                <div className="min-w-0 flex-1">
                  <button className={`text-left text-sm hover:underline ${item.isRead ? "text-slate-700" : "font-semibold text-slate-950"}`} onClick={() => void open(item)} type="button">
                    {item.message}
                  </button>
                  <p className="mt-0.5 text-xs text-slate-500">{notificationTime(item.createdAt)}{!item.isRead && <span className="sr-only"> (unread)</span>}</p>
                </div>
                {!item.isRead && (
                  <button className="rounded-md px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50" onClick={() => void markRead(item)} type="button">Mark as read</button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-slate-50 disabled:opacity-50" disabled={page <= 1} onClick={() => reload({ page: page - 1 })} type="button">Previous</button>
              <button className="rounded-md border border-slate-300 px-3 py-2 font-medium hover:bg-slate-50 disabled:opacity-50" disabled={page >= totalPages} onClick={() => reload({ page: page + 1 })} type="button">Next</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
