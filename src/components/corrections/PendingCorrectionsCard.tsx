"use client";

import { FilePenLine } from "lucide-react";
import Link from "next/link";
import { pendingCorrections } from "@/lib/liveCounts";

/** The overview card: how many correction requests are waiting for a decision. */
export function PendingCorrectionsCard() {
  const pending = pendingCorrections.useCount();
  return (
    <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 p-5" data-pending-corrections-card="">
      <div className="flex items-start gap-3">
        <FilePenLine aria-hidden="true" className="mt-0.5 size-5 text-teal-700" />
        <div>
          <h2 className="font-semibold text-slate-950">Correction requests</h2>
          <p className="mt-1 text-sm text-slate-600">
            {pending > 0
              ? `${pending} request${pending === 1 ? " is" : "s are"} waiting for your decision.`
              : "No correction requests are waiting for a decision."}
          </p>
        </div>
      </div>
      <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/institution/corrections">
        {pending > 0 ? "Review requests" : "View requests"}
      </Link>
    </section>
  );
}
