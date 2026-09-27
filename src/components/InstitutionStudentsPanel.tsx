"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  createInstitutionStudent,
  getInstitutionStudents,
  type StudentRecord,
} from "@/lib/api";

const emptyForm = {
  fullName: "",
  studentNumber: "",
  dateOfBirth: "",
  programName: "",
  enrollmentYear: "",
  email: "",
};

type StudentFieldName = keyof typeof emptyForm;

export function InstitutionStudentsPanel() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  async function refreshStudents() {
    setError("");
    try {
      const response = await getInstitutionStudents();
      setStudents(response.students);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Students could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // Load this authenticated list after the client can read the stored JWT.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStudents();
  }, []);

  function updateField(name: StudentFieldName, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setTemporaryPassword("");
    setIsSubmitting(true);

    try {
      const response = await createInstitutionStudent({
        fullName: form.fullName.trim(),
        studentNumber: form.studentNumber.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        programName: form.programName.trim(),
        enrollmentYear: Number(form.enrollmentYear),
        email: form.email.trim(),
      });
      setTemporaryPassword(response.temporaryPassword);
      setForm(emptyForm);
      setIsFormOpen(false);
      await refreshStudents();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The student could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-8 space-y-6 border-t border-slate-200 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Student management</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Students</h2>
        </div>
        <button
          className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => { setError(""); setIsFormOpen((open) => !open); }}
          type="button"
        >
          {isFormOpen ? "Cancel" : "Add student"}
        </button>
      </div>

      {temporaryPassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <p className="font-semibold">Student account created. Save this temporary password now; it will not be shown again.</p>
          <p className="mt-3 break-all rounded bg-white px-3 py-2 font-mono text-lg">{temporaryPassword}</p>
          <button
            className="mt-3 text-sm font-semibold underline"
            onClick={() => setTemporaryPassword("")}
            type="button"
          >
            Dismiss password
          </button>
        </div>
      )}

      {isFormOpen && (
        <form className="grid gap-4 rounded-md border border-slate-200 p-5 sm:grid-cols-2" onSubmit={handleSubmit}>
          <StudentField label="Full name" name="fullName" value={form.fullName} onChange={updateField} />
          <StudentField label="Student number" name="studentNumber" value={form.studentNumber} onChange={updateField} />
          <StudentField label="Login email" name="email" type="email" value={form.email} onChange={updateField} />
          <StudentField label="Date of birth" name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={updateField} required={false} />
          <StudentField label="Program name" name="programName" value={form.programName} onChange={updateField} />
          <StudentField label="Enrollment year" name="enrollmentYear" type="number" value={form.enrollmentYear} onChange={updateField} />
          {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2" role="alert">{error}</p>}
          <button className="button-primary sm:col-span-2" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creating student..." : "Create student account"}
          </button>
        </form>
      )}

      {!isFormOpen && error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-slate-600">Loading students...</p>
      ) : students.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-4 py-5 text-sm text-slate-600">No students yet — add your first student below</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Full name</th>
                <th className="px-4 py-3 font-semibold">Student number</th>
                <th className="px-4 py-3 font-semibold">Program</th>
                <th className="px-4 py-3 font-semibold">Enrollment year</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {students.map((student) => (
                <tr key={student.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{student.fullName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{student.studentNumber}</td>
                  <td className="px-4 py-3 text-slate-700">{student.programName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{student.enrollmentYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StudentField({
  label,
  name,
  type = "text",
  value,
  onChange,
  required = true,
}: {
  label: string;
  name: StudentFieldName;
  type?: string;
  value: string;
  onChange: (name: StudentFieldName, value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={`student-${name}`}>
      {label}
      <input
        className="field"
        id={`student-${name}`}
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}