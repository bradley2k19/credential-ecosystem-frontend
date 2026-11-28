"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { updateInstitutionStudent, type StudentRecord } from "@/lib/api";

const FUTURE_ONLY_NOTE = "Changes affect only certificates you issue from now on. Certificates already issued keep the details they were issued with. To correct an issued certificate, use the correction requests.";

/** Edits a student's record (the student number cannot change). Issued certificates are never affected. */
export function StudentEditDialog({ student, onClose, onSaved }: { student: StudentRecord; onClose: () => void; onSaved: (student: StudentRecord) => void }) {
  const [fullName, setFullName] = useState(student.fullName);
  const [programName, setProgramName] = useState(student.programName);
  const [enrollmentYear, setEnrollmentYear] = useState(String(student.enrollmentYear));
  const [dateOfBirth, setDateOfBirth] = useState(student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const year = Number(enrollmentYear);
    if (!fullName.trim()) return setError("Enter the student's full name.");
    if (!programName.trim()) return setError("Enter the programme.");
    if (!Number.isInteger(year) || year < 1900 || year > 2100) return setError("Enter the enrolment year as a four-digit year.");

    setIsSaving(true);
    setError("");
    try {
      const saved = await updateInstitutionStudent(student.id, {
        fullName: fullName.trim(),
        programName: programName.trim(),
        enrollmentYear: year,
        dateOfBirth: dateOfBirth || null,
      });
      onSaved({ ...student, ...saved });
    } catch (saveError) {
      setError(saveError instanceof Error ? `The changes were not saved: ${saveError.message}` : "The changes were not saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal isBusy={isSaving} onClose={onClose} size="lg" testId="student-edit-dialog" title={`Edit ${student.fullName}`}>
      <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950" data-future-only-note="">{FUTURE_ONLY_NOTE}</p>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" noValidate onSubmit={handleSubmit}>
        <EditField label="Full name" onChange={setFullName} value={fullName} />
        <label className="block text-sm font-medium text-slate-700" htmlFor="edit-studentNumber">
          Student number
          <input className="field bg-slate-50 text-slate-500" id="edit-studentNumber" readOnly value={student.studentNumber} />
          <span className="mt-1 block text-xs font-normal text-slate-500">The student number cannot be changed.</span>
        </label>
        <EditField label="Programme" onChange={setProgramName} value={programName} />
        <EditField label="Enrolment year" onChange={setEnrollmentYear} type="number" value={enrollmentYear} />
        <EditField label="Date of birth (optional)" onChange={setDateOfBirth} type="date" value={dateOfBirth} />
        {error && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={isSaving} onClick={onClose} type="button">Cancel</button>
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={isSaving} type="submit">{isSaving ? "Saving..." : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  const id = `edit-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
      {label}
      <input className="field" id={id} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  );
}
