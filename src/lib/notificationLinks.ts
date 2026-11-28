import type { AppNotification } from "@/lib/api";

export type NotificationRole = "student" | "institution";

/** Where a notification leads: the correction request it concerns, else its certificate, else the notifications page. */
export function notificationHref(role: NotificationRole, notification: Pick<AppNotification, "relatedCertificateId" | "relatedCorrectionRequestId">) {
  if (notification.relatedCorrectionRequestId) {
    return `/${role}/corrections?request=${encodeURIComponent(notification.relatedCorrectionRequestId)}`;
  }
  if (notification.relatedCertificateId) {
    return role === "student"
      ? `/student/certificates/${encodeURIComponent(notification.relatedCertificateId)}`
      : `/institution/certificates?preview=${encodeURIComponent(notification.relatedCertificateId)}`;
  }
  return `/${role}/notifications`;
}

/** "5 minutes ago", "Yesterday", or a date for older ones. */
export function notificationTime(createdAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(createdAt));
}
