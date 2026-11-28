import type { CorrectionStage } from "@/lib/api";

const stages: Record<CorrectionStage, { student: string; institution: string; classes: string }> = {
  pending: { student: "Waiting for the institution", institution: "Waiting for a decision", classes: "bg-amber-100 text-amber-900" },
  rejected: { student: "Rejected", institution: "Rejected", classes: "bg-slate-200 text-slate-800" },
  approved_awaiting_reissue: { student: "Approved, being reissued", institution: "Approved, reissue needed", classes: "bg-sky-100 text-sky-900" },
  replacement_issued: { student: "Corrected certificate issued", institution: "Replacement issued, revoke the original", classes: "bg-teal-100 text-teal-900" },
  completed: { student: "Completed", institution: "Completed", classes: "bg-emerald-100 text-emerald-800" },
};

/** A correction request's stage, worded for the student or for the institution. */
export function CorrectionStageBadge({ stage, audience }: { stage: CorrectionStage; audience: "student" | "institution" }) {
  const presentation = stages[stage] ?? { student: stage, institution: stage, classes: "bg-slate-100 text-slate-700" };
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.classes}`} data-stage={stage}>
      {presentation[audience]}
    </span>
  );
}
