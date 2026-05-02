"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { AlertCircle, Check, FileText, Loader2, Pencil, PlugZap, Upload } from "lucide-react";
import { calculateGrade } from "@/lib/grade-engine";
import { Assignment, CourseGradeInput, defaultLetterScale, GradeCategory } from "@/lib/grade-types";
import { ImportWarning, parseGradebookText, parseSyllabusText } from "@/lib/import-parser";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

type Step = "import" | "review" | "results";

const emptyCourse = (): CourseGradeInput => ({
  mode: "points",
  categories: [{ id: "coursework", name: "Coursework" }],
  assignments: [],
  letterScale: defaultLetterScale
});

async function readPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n");
}

function percent(value: number | null) {
  return value === null ? "Need data" : `${value.toFixed(2)}%`;
}

function mergeCourse(base: CourseGradeInput, incoming: CourseGradeInput): CourseGradeInput {
  return {
    ...base,
    ...incoming,
    categories: incoming.categories.length ? incoming.categories : base.categories,
    assignments: incoming.assignments.length ? incoming.assignments : base.assignments,
    letterScale: incoming.letterScale.length ? incoming.letterScale : base.letterScale
  };
}

export default function GradeApp() {
  const [step, setStep] = useState<Step>("import");
  const [course, setCourse] = useState<CourseGradeInput>(emptyCourse);
  const [paste, setPaste] = useState("");
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [target, setTarget] = useState("90");
  const result = useMemo(() => calculateGrade(course), [course]);
  const customNeed = useMemo(() => {
    const targetPercent = Number(target);
    if (!Number.isFinite(targetPercent)) return null;
    return calculateGrade({
      ...course,
      letterScale: [{ letter: `${targetPercent}%`, minimum: targetPercent }, ...course.letterScale]
    }).finalNeeds.find((need) => need.targetLetter === `${targetPercent}%`);
  }, [course, target]);

  const applyParsed = (parsed: ReturnType<typeof parseGradebookText>) => {
    setCourse((current) => mergeCourse(current, parsed.course));
    setWarnings(parsed.warnings);
    setStep("review");
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
        ? await readPdfText(file)
        : await file.text();
      applyParsed(file.name.toLowerCase().endsWith(".pdf") ? parseSyllabusText(text) : parseGradebookText(text, "csv"));
    } catch {
      setWarnings([{ level: "error", message: "Could not read that file. For locked PDFs, copy the rubric text or export the gradebook as CSV." }]);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const handlePasteImport = () => {
    applyParsed(parseGradebookText(paste, "paste"));
  };

  const updateAssignment = (id: string, patch: Partial<Assignment>) => {
    setCourse((current) => ({
      ...current,
      assignments: current.assignments.map((assignment) => assignment.id === id ? { ...assignment, ...patch } : assignment)
    }));
  };

  const updateCategory = (id: string, patch: Partial<GradeCategory>) => {
    setCourse((current) => ({
      ...current,
      categories: current.categories.map((category) => category.id === id ? { ...category, ...patch } : category)
    }));
  };

  const addManualAssignment = () => {
    const categoryId = course.categories[0]?.id ?? "coursework";
    setCourse((current) => ({
      ...current,
      categories: current.categories.length ? current.categories : [{ id: categoryId, name: "Coursework" }],
      assignments: [
        ...current.assignments,
        {
          id: `manual-${Date.now()}`,
          name: "Manual item",
          categoryId,
          earned: null,
          possible: 100
        }
      ]
    }));
  };

  return (
    <main className="shell">
      <section className="workspace" aria-label="Grade import and results">
        <header className="topline">
          <div>
            <p className="eyebrow">GuessmyGPA</p>
            <h1>Import grades. Know the number.</h1>
          </div>
          <button className="ghost" type="button" onClick={() => setDrawerOpen(true)}>
            <Pencil aria-hidden="true" size={16} />
            Edit
          </button>
        </header>

        <div className="grade-hero">
          <div>
            <span className="label">Current grade</span>
            <strong>{percent(result.currentPercent)}</strong>
          </div>
          <div className="letter" aria-label="Current letter grade">{result.currentLetter ?? "-"}</div>
        </div>

        <section className="need-card" aria-label="Final exam target calculator">
          <div>
            <span className="label">What do I need on the final?</span>
            <div className="target-row">
              <input
                aria-label="Target course percentage"
                value={target}
                inputMode="decimal"
                onChange={(event) => setTarget(event.target.value)}
              />
              <span>% course target</span>
            </div>
          </div>
          <strong>
            {customNeed?.requiredFinalPercent === null || !customNeed
              ? "Need final weight"
              : `${customNeed.requiredFinalPercent.toFixed(2)}%`}
          </strong>
        </section>

        {(result.warnings.length > 0 || result.assumptions.length > 0 || warnings.length > 0) && (
          <section className="notice" aria-live="polite">
            {[...warnings.map((warning) => warning.message), ...result.warnings, ...result.assumptions].map((message) => (
              <p key={message}><AlertCircle aria-hidden="true" size={16} />{message}</p>
            ))}
          </section>
        )}

        {step === "import" && (
          <section className="panel import-panel">
            <div className="panel-head">
              <FileText aria-hidden="true" />
              <div>
                <h2>Import course data</h2>
                <p>CSV exports, pasted gradebook tables, and syllabus/PDF rubric text are parsed locally in your browser.</p>
              </div>
            </div>
            <label className="dropzone">
              {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              <span>{busy ? "Reading file..." : "Upload CSV or syllabus PDF"}</span>
              <input accept=".csv,.txt,.tsv,.pdf,text/csv,application/pdf" type="file" onChange={handleFile} />
            </label>
            <textarea
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder="Paste a gradebook table with columns like Assignment, Category, Earned, Possible, Weight."
              aria-label="Paste gradebook table"
            />
            <button className="primary" type="button" onClick={handlePasteImport} disabled={!paste.trim() || busy}>
              Parse pasted data
            </button>
            <div className="icollege">
              <PlugZap aria-hidden="true" size={18} />
              <p><strong>iCollege:</strong> Direct connection requires school-authorized access. Until that is available, export grades to CSV or paste the grade table here.</p>
            </div>
          </section>
        )}

        {step === "review" && (
          <ReviewPanel
            course={course}
            onCategoryChange={updateCategory}
            onAssignmentChange={updateAssignment}
            onAdd={addManualAssignment}
            onConfirm={() => setStep("results")}
            onEdit={() => setDrawerOpen(true)}
          />
        )}

        {step === "results" && (
          <ResultsView course={course} onProjectionChange={(includeUngradedAsZero) => setCourse((current) => ({ ...current, includeUngradedAsZero }))} />
        )}
      </section>

      {drawerOpen && (
        <EditDrawer
          course={course}
          onClose={() => setDrawerOpen(false)}
          onCourseChange={setCourse}
          onAdd={addManualAssignment}
        />
      )}
    </main>
  );
}

function ReviewPanel({
  course,
  onCategoryChange,
  onAssignmentChange,
  onAdd,
  onConfirm,
  onEdit
}: {
  course: CourseGradeInput;
  onCategoryChange: (id: string, patch: Partial<GradeCategory>) => void;
  onAssignmentChange: (id: string, patch: Partial<Assignment>) => void;
  onAdd: () => void;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <Check aria-hidden="true" />
        <div>
          <h2>Review parsed data</h2>
          <p>Confirm missing points, category weights, and final exam details before calculating.</p>
        </div>
      </div>
      <div className="compact-grid">
        <label>
          Grading mode
          <select value={course.mode} onChange={() => undefined} disabled>
            <option value={course.mode}>{course.mode === "weighted" ? "Weighted categories" : "Total points"}</option>
          </select>
        </label>
        <label>
          Final weight
          <input
            inputMode="decimal"
            value={course.finalExamWeight ?? ""}
            onChange={() => undefined}
            placeholder="Unknown"
            readOnly
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Category</th>
              <th>Earned</th>
              <th>Possible</th>
            </tr>
          </thead>
          <tbody>
            {course.assignments.length ? course.assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td>{assignment.name}</td>
                <td>
                  <select
                    value={assignment.categoryId ?? ""}
                    onChange={(event) => onAssignmentChange(assignment.id, { categoryId: event.target.value })}
                  >
                    {course.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    inputMode="decimal"
                    value={assignment.earned ?? ""}
                    placeholder="Ungraded"
                    onChange={(event) => onAssignmentChange(assignment.id, { earned: event.target.value === "" ? null : Number(event.target.value) })}
                  />
                </td>
                <td>
                  <input
                    inputMode="decimal"
                    value={assignment.possible}
                    onChange={(event) => onAssignmentChange(assignment.id, { possible: Number(event.target.value) })}
                  />
                </td>
              </tr>
            )) : (
              <tr><td colSpan={4}>No assignments yet. Add one only if import is unavailable.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {course.mode === "weighted" && (
        <div className="category-list">
          {course.categories.map((category) => (
            <label key={category.id}>
              {category.name} weight
              <input
                inputMode="decimal"
                value={category.weight ?? ""}
                onChange={(event) => onCategoryChange(category.id, { weight: event.target.value === "" ? undefined : Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
      )}
      <div className="category-list">
        {course.categories.map((category) => (
          <label key={`${category.id}-drop`}>
            {category.name} drops
            <input
              inputMode="numeric"
              value={category.dropLowest ?? 0}
              onChange={(event) => onCategoryChange(category.id, { dropLowest: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className="ghost" type="button" onClick={onAdd}>Add fallback item</button>
        <button className="ghost" type="button" onClick={onEdit}>Open edit drawer</button>
        <button className="primary" type="button" onClick={onConfirm}>Calculate grade</button>
      </div>
    </section>
  );
}

function ResultsView({
  course,
  onProjectionChange
}: {
  course: CourseGradeInput;
  onProjectionChange: (includeUngradedAsZero: boolean) => void;
}) {
  const result = calculateGrade(course);
  return (
    <section className="panel results">
      <div className="panel-head">
        <Check aria-hidden="true" />
        <div>
          <h2>Results</h2>
          <p>Current grade excludes ungraded work unless projection is enabled.</p>
        </div>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={course.includeUngradedAsZero === true}
          onChange={(event) => onProjectionChange(event.target.checked)}
        />
        Count ungraded work as zero for projection
      </label>
      <div className="result-metrics">
        <article>
          <span>Current</span>
          <strong>{percent(result.currentPercent)}</strong>
          <p>{result.currentLetter ?? "No letter yet"}</p>
        </article>
        <article>
          <span>Projected final</span>
          <strong>{percent(result.projectedPercent)}</strong>
          <p>{result.projectedLetter ?? "No letter yet"}</p>
        </article>
      </div>
      <div className="breakdown">
        {result.categoryBreakdown.map((category) => (
          <article key={category.categoryId}>
            <div>
              <h3>{category.name}</h3>
              <p>{category.earnedPoints} / {category.possiblePoints} points</p>
            </div>
            <strong>{percent(category.percent)}</strong>
            {category.weight !== null && <span>{category.weight}% weight</span>}
          </article>
        ))}
      </div>
      <div className="finals">
        {result.finalNeeds.slice(0, 4).map((need) => (
          <article key={need.targetLetter}>
            <span>{need.targetLetter} ({need.targetPercent}%)</span>
            <strong>{need.requiredFinalPercent === null ? "Need final weight" : `${need.requiredFinalPercent.toFixed(2)}%`}</strong>
            {need.reason && <p>{need.reason}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function EditDrawer({
  course,
  onCourseChange,
  onClose,
  onAdd
}: {
  course: CourseGradeInput;
  onCourseChange: (course: CourseGradeInput) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="drawer" aria-label="Edit grade assumptions" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>Edit assumptions</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close edit drawer">×</button>
        </header>
        <label>
          Calculation mode
          <select value={course.mode} onChange={(event) => onCourseChange({ ...course, mode: event.target.value as CourseGradeInput["mode"] })}>
            <option value="points">Total points</option>
            <option value="weighted">Weighted categories</option>
          </select>
        </label>
        <label>
          Final exam weight
          <input
            inputMode="decimal"
            value={course.finalExamWeight ?? ""}
            placeholder="Unknown"
            onChange={(event) => onCourseChange({ ...course, finalExamWeight: event.target.value === "" ? undefined : Number(event.target.value) })}
          />
        </label>
        <button className="ghost full" type="button" onClick={onAdd}>Add manual fallback item</button>
        <div className="scale-list">
          <h3>Categories</h3>
          {course.categories.map((category) => (
            <div className="drawer-grid" key={category.id}>
              <label>
                {category.name} weight
                <input
                  inputMode="decimal"
                  value={category.weight ?? ""}
                  placeholder="Points mode"
                  onChange={(event) => {
                    const categories = course.categories.map((item) =>
                      item.id === category.id ? { ...item, weight: event.target.value === "" ? undefined : Number(event.target.value) } : item
                    );
                    onCourseChange({ ...course, categories });
                  }}
                />
              </label>
              <label>
                Drop lowest
                <input
                  inputMode="numeric"
                  value={category.dropLowest ?? 0}
                  onChange={(event) => {
                    const categories = course.categories.map((item) =>
                      item.id === category.id ? { ...item, dropLowest: Number(event.target.value) } : item
                    );
                    onCourseChange({ ...course, categories });
                  }}
                />
              </label>
            </div>
          ))}
        </div>
        <div className="scale-list">
          <h3>Letter scale</h3>
          {course.letterScale.map((boundary, index) => (
            <label key={boundary.letter}>
              {boundary.letter}
              <input
                inputMode="decimal"
                value={boundary.minimum}
                onChange={(event) => {
                  const next = [...course.letterScale];
                  next[index] = { ...boundary, minimum: Number(event.target.value) };
                  onCourseChange({ ...course, letterScale: next });
                }}
              />
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}
