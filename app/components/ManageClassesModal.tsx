"use client";

import {
  BookOpenCheck,
  Loader2,
  Pencil,
  Save,
  School,
  UsersRound,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";

import {
  createSchoolClass,
  getAdministratorClasses,
  type SchoolClassSummary,
  updateSchoolClass,
} from "@/actions/stream";
import AuthContext from "@/app/components/AuthContext";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ManageClassesModal() {
  const { role, user } = useContext(AuthContext);
  const [classes, setClasses] = useState<SchoolClassSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [editingRoster, setEditingRoster] = useState("");
  const [isSavingRoster, setIsSavingRoster] = useState(false);
  const [isLoading, startLoadingTransition] = useTransition();

  useEffect(() => {
    if (!user || role !== "administrator") return;

    let cancelled = false;

    startLoadingTransition(async () => {
      const result = await getAdministratorClasses(await user.getIdToken());

      if (cancelled) return;

      if (result.success) {
        setClasses(result.classes);
        return;
      }

      setErrorMessage(result.error ?? "Unable to load classes");
    });

    return () => {
      cancelled = true;
    };
  }, [role, user]);

  const handleCreateClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!user || role !== "administrator") {
      setErrorMessage("Only administrators can create classes");
      return;
    }

    setIsCreating(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("className") ?? "").trim();
    const studentUsernames = [
      ...new Set(
        String(formData.get("students") ?? "")
          .split(",")
          .map((username) => username.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];

    try {
      const result = await createSchoolClass({
        firebaseIdToken: await user.getIdToken(),
        name,
        studentUsernames,
      });

      if (!result.success || !result.classRecord) {
        setErrorMessage(result.error ?? "Unable to create class");
        return;
      }

      const classRecord = result.classRecord;
      setClasses((current) =>
        [...current, classRecord].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setSuccessMessage(`${classRecord.name} is ready for assignments.`);
      form.reset();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create class",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const beginEditing = (schoolClass: SchoolClassSummary) => {
    setEditingClassId(schoolClass.id);
    setEditingClassName(schoolClass.name);
    setEditingRoster(schoolClass.studentUsernames.join(", "));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const cancelEditing = () => {
    setEditingClassId(null);
    setEditingClassName("");
    setEditingRoster("");
  };

  const handleUpdateClass = async (classId: string) => {
    setErrorMessage("");
    setSuccessMessage("");

    if (!user || role !== "administrator") {
      setErrorMessage("Only administrators can edit classes");
      return;
    }

    const studentUsernames = [
      ...new Set(
        editingRoster
          .split(",")
          .map((username) => username.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    setIsSavingRoster(true);

    try {
      const result = await updateSchoolClass({
        classId,
        firebaseIdToken: await user.getIdToken(),
        name: editingClassName,
        studentUsernames,
      });

      if (!result.success || !result.classRecord) {
        setErrorMessage(result.error ?? "Unable to update the class");
        return;
      }

      const classRecord = result.classRecord;
      setClasses((current) =>
        current
          .map((item) =>
            item.id === classRecord.id ? classRecord : item,
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      const syncMessage =
        "syncedAssignmentCount" in result && result.syncedAssignmentCount > 0
          ? `${result.syncedAssignmentCount} missing assignment channel${result.syncedAssignmentCount === 1 ? " was" : "s were"} added for newly enrolled students.`
          : "";
      setSuccessMessage(
        [
          `${classRecord.name} was updated successfully.`,
          syncMessage,
          result.warning,
        ]
          .filter(Boolean)
          .join(" "),
      );
      window.dispatchEvent(
        new CustomEvent("snapschool:class-updated", {
          detail: {
            ...classRecord,
            assignmentsChanged:
              "syncedAssignmentCount" in result &&
              result.syncedAssignmentCount > 0,
          },
        }),
      );
      cancelEditing();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update the class",
      );
    } finally {
      setIsSavingRoster(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <School className="size-5 text-indigo-600" /> Manage classes
        </DialogTitle>
        <DialogDescription>
          Save a student roster once, then assign individual work to the entire
          class without entering usernames again.
        </DialogDescription>
      </DialogHeader>

      <form className="space-y-4 rounded-2xl bg-slate-50 p-4" onSubmit={handleCreateClass}>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="className">
            Class name
          </label>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-3 focus:ring-indigo-100"
            id="className"
            maxLength={80}
            minLength={2}
            name="className"
            placeholder="English 8 — Period 2"
            required
            type="text"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="students">
            Student usernames
          </label>
          <textarea
            className="min-h-24 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-3 focus:ring-indigo-100"
            id="students"
            name="students"
            placeholder="alex, jordan, sam"
            required
          />
          <p className="text-xs leading-5 text-slate-500">
            Separate usernames with commas. Every account must be registered as
            a student.
          </p>
        </div>

        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          disabled={isCreating}
          type="submit"
        >
          {isCreating ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
          {isCreating ? "Creating class..." : "Save class roster"}
        </button>
      </form>

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
          {successMessage}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Your classes</h3>
          <span className="text-sm text-slate-500">{classes.length} total</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-8 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Loading classes...
          </div>
        ) : classes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
            <UsersRound className="mx-auto mb-2 size-6 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">No classes yet</p>
            <p className="mt-1 text-xs text-slate-500">Create your first reusable roster above.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {classes.map((schoolClass) => (
              <article
                className={`rounded-xl border border-slate-200 p-4 ${
                  editingClassId === schoolClass.id ? "sm:col-span-2" : ""
                }`}
                key={schoolClass.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{schoolClass.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {schoolClass.studentCount} student{schoolClass.studentCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {editingClassId !== schoolClass.id && (
                    <button
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                      onClick={() => beginEditing(schoolClass)}
                      type="button"
                    >
                      <Pencil className="size-3.5" /> Edit class
                    </button>
                  )}
                </div>

                {editingClassId === schoolClass.id ? (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-2">
                      <label
                        className="block text-sm font-medium"
                        htmlFor={`class-name-${schoolClass.id}`}
                      >
                        Class name
                      </label>
                      <input
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-3 focus:ring-indigo-100"
                        id={`class-name-${schoolClass.id}`}
                        maxLength={80}
                        minLength={2}
                        onChange={(event) => setEditingClassName(event.target.value)}
                        required
                        type="text"
                        value={editingClassName}
                      />
                      <p className="text-xs leading-5 text-slate-500">
                        Renaming a class keeps its roster, assignments, and progress intact.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label
                        className="block text-sm font-medium"
                        htmlFor={`roster-${schoolClass.id}`}
                      >
                        Student usernames
                      </label>
                      <textarea
                        className="min-h-28 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-3 focus:ring-indigo-100"
                        id={`roster-${schoolClass.id}`}
                        onChange={(event) => setEditingRoster(event.target.value)}
                        value={editingRoster}
                      />
                      <p className="text-xs leading-5 text-slate-500">
                        Add or remove comma-separated student usernames. Newly
                        added students receive the class&apos;s existing individual
                        assignments with fresh progress; removing a student does
                        not delete their historical work.
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        disabled={isSavingRoster}
                        onClick={cancelEditing}
                        type="button"
                      >
                        <X className="size-4" /> Cancel
                      </button>
                      <button
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        disabled={
                          isSavingRoster ||
                          editingClassName.trim().length < 2 ||
                          editingRoster.trim().length === 0
                        }
                        onClick={() => void handleUpdateClass(schoolClass.id)}
                        type="button"
                      >
                        {isSavingRoster ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        {isSavingRoster ? "Saving..." : "Save class changes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">
                    {schoolClass.studentUsernames.join(", ")}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </DialogContent>
  );
}
