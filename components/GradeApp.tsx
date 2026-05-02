"use client";

import { ChangeEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronDown,
  FileText,
  Info,
  Loader2,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload
} from "lucide-react";
import { calculateGrade } from "@/lib/grade-engine";
import { Assignment, CourseGradeInput, defaultLetterScale, GradeCategory, LetterBoundary } from "@/lib/grade-types";
import { ImportWarning, parseGradebookText, parseSyllabusText } from "@/lib/import-parser";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

type InputMode = "import" | "quick" | "manual";

const starterCategories: GradeCategory[] = [
  { id: "homework", name: "Homework", weight: 20 },
  { id: "quizzes", name: "Quizzes", weight: 15 },
  { id: "exams", name: "Exams", weight: 40 },
  { id: "final", name: "Final", weight: 25 }
];

const emptyCourse = (): CourseGradeInput => ({
  mode: "weighted",
  categories: starterCategories,
  assignments: [
    {
      id: "quick-homework",
      name: "Homework average",
      categoryId: "homework",
      earned: null,
      possible: 100,
      graded: false,
      source: "quick-category"
    },
    {
      id: "quick-quizzes",
      name: "Quizzes average",
      categoryId: "quizzes",
      earned: null,
      possible: 100,
      graded: false,
      source: "quick-category"
    },
    {
      id: "quick-exams",
      name: "Exams average",
      categoryId: "exams",
      earned: null,
      possible: 100,
      graded: false,
      source: "quick-category"
    }
  ],
  letterScale: defaultLetterScale,
  finalExamWeight: 25
});

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const cleanNumber = (value: string) => {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const displayPercent = (value: number | null) => value === null ? "Need data" : `${value.toFixed(2)}%`;
const displayShortPercent = (value: number | null) => value === null ? "Missing" : `${value.toFixed(1)}%`;
const formatPoints = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);
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

function mergeCourse(base: CourseGradeInput, incoming: CourseGradeInput): CourseGradeInput {
  const nextCategories = incoming.categories.length ? incoming.categories : base.categories;
  const incomingCategoryIds = new Set(nextCategories.map((category) => category.id));
  const nextAssignments = incoming.assignments.length
    ? incoming.assignments
    : base.assignments.filter((assignment) => !assignment.categoryId || incomingCategoryIds.has(assignment.categoryId));
  return {
    ...base,
    ...incoming,
    categories: nextCategories,
    assignments: nextAssignments,
    letterScale: incoming.letterScale.length ? incoming.letterScale : base.letterScale,
    finalExamWeight: incoming.finalExamWeight ?? base.finalExamWeight
  };
}

function categoryAverage(course: CourseGradeInput, categoryId: string) {
  const assignments = course.assignments.filter((assignment) =>
    assignment.categoryId === categoryId && assignment.source === "quick-category"
  );
  return assignments[0]?.earned ?? null;
}

export default function GradeApp() {
  const [course, setCourse] = useState<CourseGradeInput>(emptyCourse);
  const [paste, setPaste] = useState("");
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeInput, setActiveInput] = useState<InputMode>("import");
  const [target, setTarget] = useState("90");

  const result = useMemo(() => calculateGrade(course), [course]);
  const customNeed = useMemo(() => {
    const targetPercent = cleanNumber(target);
    if (targetPercent === null) return null;
    return calculateGrade({
      ...course,
      letterScale: [{ letter: `${targetPercent}%`, minimum: targetPercent }, ...course.letterScale]
    }).finalNeeds.find((need) => need.targetLetter === `${targetPercent}%`) ?? null;
  }, [course, target]);

  const totalWeight = course.categories.reduce((sum, category) => sum + (category.weight ?? 0), 0);
  const gradedAssignments = course.assignments.filter((assignment) => assignment.earned !== null);
  const ungradedAssignments = course.assignments.filter((assignment) => assignment.earned === null);
  const messages = [
    ...warnings.map((warning) => ({ level: warning.level, message: warning.message })),
    ...result.warnings.map((message) => ({ level: "warning" as const, message })),
    ...result.assumptions.map((message) => ({ level: "warning" as const, message }))
  ];

  const applyParsed = (parsed: ReturnType<typeof parseGradebookText>) => {
    setCourse((current) => mergeCourse(current, parsed.course));
    setWarnings(parsed.warnings);
    setActiveInput("manual");
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

  const updateCourse = (patch: Partial<CourseGradeInput>) => {
    setCourse((current) => ({ ...current, ...patch }));
  };

  const updateCategory = (id: string, patch: Partial<GradeCategory>) => {
    setCourse((current) => ({
      ...current,
      categories: current.categories.map((category) => category.id === id ? { ...category, ...patch } : category)
    }));
  };

  const addCategory = () => {
    const id = uid("category");
    setCourse((current) => ({
      ...current,
      categories: [...current.categories, { id, name: "New category", weight: 0 }]
    }));
  };

  const removeCategory = (id: string) => {
    setCourse((current) => {
      const fallback = current.categories.find((category) => category.id !== id)?.id;
      return {
        ...current,
        categories: current.categories.filter((category) => category.id !== id),
        assignments: current.assignments
          .filter((assignment) => assignment.source !== "quick-category" || assignment.categoryId !== id)
          .map((assignment) => assignment.categoryId === id ? { ...assignment, categoryId: fallback } : assignment)
      };
    });
  };

  const updateAssignment = (id: string, patch: Partial<Assignment>) => {
    setCourse((current) => ({
      ...current,
      assignments: current.assignments.map((assignment) => assignment.id === id ? { ...assignment, ...patch } : assignment)
    }));
  };

  const addAssignment = () => {
    const categoryId = course.categories[0]?.id ?? "coursework";
    setCourse((current) => ({
      ...current,
      categories: current.categories.length ? current.categories : [{ id: categoryId, name: "Coursework" }],
      assignments: [
        ...current.assignments,
        {
          id: uid("assignment"),
          name: "New assignment",
          categoryId,
          earned: null,
          possible: 100,
          graded: false,
          source: "manual"
        }
      ]
    }));
  };

  const removeAssignment = (id: string) => {
    setCourse((current) => ({
      ...current,
      assignments: current.assignments.filter((assignment) => assignment.id !== id)
    }));
  };

  const updateLetterScale = (index: number, patch: Partial<LetterBoundary>) => {
    setCourse((current) => {
      const next = [...current.letterScale];
      next[index] = { ...next[index], ...patch };
      return { ...current, letterScale: next };
    });
  };

  const setQuickAverage = (category: GradeCategory, rawValue: string) => {
    const average = cleanNumber(rawValue);
    setCourse((current) => {
      const existing = current.assignments.find((assignment) =>
        assignment.source === "quick-category" && assignment.categoryId === category.id
      );
      if (existing) {
        return {
          ...current,
          assignments: current.assignments.map((assignment) =>
            assignment.id === existing.id
              ? { ...assignment, earned: average, graded: average !== null, missing: average === null }
              : assignment
          )
        };
      }
      return {
        ...current,
        assignments: [
          ...current.assignments,
          {
            id: `quick-${category.id}`,
            name: `${category.name} average`,
            categoryId: category.id,
            earned: average,
            possible: 100,
            graded: average !== null,
            missing: average === null,
            source: "quick-category"
          }
        ]
      };
    });
  };

  const tableRows = course.assignments.filter((assignment) => assignment.source !== "quick-category");

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="GuessmyGPA home">
          <span aria-hidden="true">G</span>
          GuessmyGPA
        </a>
        <div className="topbar-actions" aria-label="Course controls">
          <label className="course-select">
            <span>Course</span>
            <select aria-label="Course">
              <option>Current course</option>
            </select>
          </label>
          <button className="text-button" type="button" onClick={() => setCourse(emptyCourse())}>
            Reset
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Student grade calculator</p>
          <h1>Know your grade before the semester ends.</h1>
          <p>
            Import a gradebook, enter category averages, or build the course by hand. Every result is calculated from your explicit inputs and shown with the math beside it.
          </p>
        </div>
        <div className="hero-facts" aria-label="Current course data status">
          <div>
            <span>{gradedAssignments.length}</span>
            <p>graded inputs</p>
          </div>
          <div>
            <span>{ungradedAssignments.length}</span>
            <p>excluded or projected</p>
          </div>
          <div>
            <span>{course.mode === "weighted" ? `${totalWeight}%` : "points"}</span>
            <p>rubric basis</p>
          </div>
        </div>
      </section>

      <section className="result-stage" aria-label="Current grade results">
        <article className="grade-display">
          <div className="grade-kicker">
            <span>Current grade</span>
            <strong>{result.currentLetter ?? "No letter yet"}</strong>
          </div>
          <p>{displayPercent(result.currentPercent)}</p>
          <small>Based on graded work only. Ungraded items are excluded unless projection is enabled.</small>
        </article>

        <aside className="final-display" aria-label="Final exam calculator">
          <div>
            <p className="section-label">Final exam need</p>
            <label className="target-control">
              <span>Target course grade</span>
              <input
                value={target}
                inputMode="decimal"
                aria-label="Target course percentage"
                onChange={(event) => setTarget(event.target.value)}
              />
              <b>%</b>
            </label>
          </div>
          <strong>
            {customNeed?.requiredFinalPercent === null || !customNeed
              ? "Need final weight"
              : `${customNeed.requiredFinalPercent.toFixed(2)}%`}
          </strong>
          <p>{customNeed?.reason ?? "Uses: target = current non-final grade x remaining weight + final score x final weight."}</p>
        </aside>
      </section>

      {messages.length > 0 && (
        <section className="message-strip" aria-live="polite">
          {messages.map((message) => (
            <p key={message.message} className={message.level === "error" ? "error" : ""}>
              <AlertTriangle aria-hidden="true" size={16} />
              {message.message}
            </p>
          ))}
        </section>
      )}

      <section className="input-methods" aria-label="Choose how to enter grade data">
        {[
          { id: "import" as const, icon: Upload, title: "Import data", detail: "CSV, pasted tables, or syllabus/PDF rubric text." },
          { id: "quick" as const, icon: SlidersHorizontal, title: "Quick categories", detail: "Enter category weights and averages in seconds." },
          { id: "manual" as const, icon: BookOpen, title: "Manual assignments", detail: "Add, edit, and review every grade row." }
        ].map((method) => {
          const Icon = method.icon;
          return (
            <button
              className={activeInput === method.id ? "method active" : "method"}
              key={method.id}
              type="button"
              onClick={() => setActiveInput(method.id)}
            >
              <Icon aria-hidden="true" size={18} />
              <span>{method.title}</span>
              <p>{method.detail}</p>
            </button>
          );
        })}
      </section>

      {activeInput === "import" && (
        <section className="section-grid import-section" aria-labelledby="import-heading">
          <div className="section-intro">
            <p className="section-label">Import</p>
            <h2 id="import-heading">Bring in the gradebook you already have.</h2>
            <p>Parsing happens locally. Missing possible points, unclear weights, and locked PDFs are surfaced as warnings, never filled in silently.</p>
          </div>
          <div className="section-body">
            <label className="dropzone">
              {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              <span>{busy ? "Reading file..." : "Upload CSV, TXT, TSV, or PDF"}</span>
              <input accept=".csv,.txt,.tsv,.pdf,text/csv,application/pdf" type="file" onChange={handleFile} />
            </label>
            <label>
              Paste gradebook table
              <textarea
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                placeholder={"Assignment, Category, Earned, Possible, Weight\nQuiz 1, Quizzes, 9, 10, 15"}
              />
            </label>
            <div className="actions-row">
              <button className="primary-button" type="button" disabled={!paste.trim() || busy} onClick={() => applyParsed(parseGradebookText(paste, "paste"))}>
                Parse pasted data
              </button>
              <button className="secondary-button" type="button" onClick={() => applyParsed(parseSyllabusText(paste))} disabled={!paste.trim() || busy}>
                Parse as syllabus rubric
              </button>
            </div>
          </div>
        </section>
      )}

      {activeInput === "quick" && (
        <section className="section-grid" aria-labelledby="quick-heading">
          <div className="section-intro">
            <p className="section-label">Quick setup</p>
            <h2 id="quick-heading">Use category averages when assignment detail is unavailable.</h2>
            <p>Each average is stored as an explicit 100-point input, so the formula remains inspectable.</p>
          </div>
          <div className="section-body">
            <QuickCategoryTable
              course={course}
              onCategoryChange={updateCategory}
              onAverageChange={setQuickAverage}
              onRemove={removeCategory}
              onAdd={addCategory}
            />
          </div>
        </section>
      )}

      <section className="section-grid" aria-labelledby="manual-heading">
        <div className="section-intro">
          <p className="section-label">Manual entry</p>
          <h2 id="manual-heading">Review imported rows or add assignments one by one.</h2>
          <p>Ungraded rows stay out of the current grade. Mark a row graded only when the score is known.</p>
        </div>
        <div className="section-body">
          <AssignmentTable
            assignments={tableRows}
            categories={course.categories}
            onAdd={addAssignment}
            onRemove={removeAssignment}
            onChange={updateAssignment}
          />
        </div>
      </section>

      <section className="section-grid" aria-labelledby="rubric-heading">
        <div className="section-intro">
          <p className="section-label">Rubric</p>
          <h2 id="rubric-heading">Control weights, drops, finals, and the letter scale.</h2>
          <p>Switch between total-points and weighted-category math without changing the underlying grade rows.</p>
        </div>
        <div className="section-body rubric-grid">
          <div className="control-panel">
            <label>
              Calculation mode
              <select value={course.mode} onChange={(event) => updateCourse({ mode: event.target.value as CourseGradeInput["mode"] })}>
                <option value="weighted">Weighted categories</option>
                <option value="points">Total points</option>
              </select>
            </label>
            <label>
              Final exam weight
              <input
                value={course.finalExamWeight ?? ""}
                inputMode="decimal"
                placeholder="Unknown"
                onChange={(event) => updateCourse({ finalExamWeight: cleanNumber(event.target.value) ?? undefined })}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={course.includeUngradedAsZero === true}
                onChange={(event) => updateCourse({ includeUngradedAsZero: event.target.checked })}
              />
              Count ungraded work as zero for projection
            </label>
          </div>
          <div className="scale-panel">
            <h3>Letter scale</h3>
            {course.letterScale.map((boundary, index) => (
              <div className="scale-row" key={`${boundary.letter}-${index}`}>
                <input
                  value={boundary.letter}
                  aria-label={`Letter name ${index + 1}`}
                  onChange={(event) => updateLetterScale(index, { letter: event.target.value })}
                />
                <input
                  value={boundary.minimum}
                  inputMode="decimal"
                  aria-label={`${boundary.letter} minimum percentage`}
                  onChange={(event) => updateLetterScale(index, { minimum: cleanNumber(event.target.value) ?? 0 })}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-grid explanation-section" aria-labelledby="math-heading">
        <div className="section-intro">
          <p className="section-label">Math</p>
          <h2 id="math-heading">Transparent formulas, no invented values.</h2>
          <p>These numbers update immediately from the rows above. Anything missing is shown as missing.</p>
        </div>
        <div className="section-body">
          <ResultsExplanation course={course} target={target} />
        </div>
      </section>
    </main>
  );
}

function QuickCategoryTable({
  course,
  onCategoryChange,
  onAverageChange,
  onRemove,
  onAdd
}: {
  course: CourseGradeInput;
  onCategoryChange: (id: string, patch: Partial<GradeCategory>) => void;
  onAverageChange: (category: GradeCategory, value: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="editable-table">
      <div className="table-head category-head">
        <span>Category</span>
        <span>Weight</span>
        <span>Average</span>
        <span>Drops</span>
        <span />
      </div>
      {course.categories.map((category) => (
        <div className="table-row category-row" key={category.id}>
          <input
            value={category.name}
            aria-label="Category name"
            onChange={(event) => onCategoryChange(category.id, { name: event.target.value })}
          />
          <input
            value={category.weight ?? ""}
            inputMode="decimal"
            aria-label={`${category.name} weight`}
            placeholder="%"
            onChange={(event) => onCategoryChange(category.id, { weight: cleanNumber(event.target.value) ?? undefined })}
          />
          <input
            value={categoryAverage(course, category.id) ?? ""}
            inputMode="decimal"
            aria-label={`${category.name} average`}
            placeholder="Not known"
            onChange={(event) => onAverageChange(category, event.target.value)}
          />
          <input
            value={category.dropLowest ?? 0}
            inputMode="numeric"
            aria-label={`${category.name} drop lowest count`}
            onChange={(event) => onCategoryChange(category.id, { dropLowest: cleanNumber(event.target.value) ?? 0 })}
          />
          <button className="icon-button" type="button" onClick={() => onRemove(category.id)} aria-label={`Remove ${category.name}`}>
            <Trash2 aria-hidden="true" size={16} />
          </button>
        </div>
      ))}
      <button className="secondary-button add-button" type="button" onClick={onAdd}>
        <Plus aria-hidden="true" size={16} />
        Add category
      </button>
    </div>
  );
}

function AssignmentTable({
  assignments,
  categories,
  onAdd,
  onRemove,
  onChange
}: {
  assignments: Assignment[];
  categories: GradeCategory[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, patch: Partial<Assignment>) => void;
}) {
  return (
    <div className="editable-table assignment-table">
      <div className="table-head assignment-head">
        <span>Assignment</span>
        <span>Category</span>
        <span>Earned</span>
        <span>Possible</span>
        <span>Status</span>
        <span>Due</span>
        <span>Flags</span>
        <span />
      </div>
      {assignments.length === 0 ? (
        <div className="empty-state">
          <FileText aria-hidden="true" />
          <p>No assignment rows yet. Import a gradebook or add the first row manually.</p>
        </div>
      ) : assignments.map((assignment) => (
        <div className="table-row assignment-row" key={assignment.id}>
          <input
            value={assignment.name}
            aria-label="Assignment name"
            onChange={(event) => onChange(assignment.id, { name: event.target.value })}
          />
          <select
            value={assignment.categoryId ?? ""}
            aria-label={`${assignment.name} category`}
            onChange={(event) => onChange(assignment.id, { categoryId: event.target.value })}
          >
            <option value="">Uncategorized</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
          <input
            value={assignment.earned ?? ""}
            inputMode="decimal"
            aria-label={`${assignment.name} earned points`}
            placeholder="Ungraded"
            onChange={(event) => {
              const earned = cleanNumber(event.target.value);
              onChange(assignment.id, { earned, graded: earned !== null, missing: earned === null });
            }}
          />
          <input
            value={assignment.possible}
            inputMode="decimal"
            aria-label={`${assignment.name} possible points`}
            onChange={(event) => onChange(assignment.id, { possible: cleanNumber(event.target.value) ?? 0 })}
          />
          <select
            value={assignment.earned === null ? "ungraded" : "graded"}
            aria-label={`${assignment.name} graded status`}
            onChange={(event) => {
              const graded = event.target.value === "graded";
              onChange(assignment.id, { graded, earned: graded ? assignment.earned ?? 0 : null, missing: !graded });
            }}
          >
            <option value="graded">Graded</option>
            <option value="ungraded">Ungraded</option>
          </select>
          <input
            type="date"
            value={assignment.dueDate ?? ""}
            aria-label={`${assignment.name} due date`}
            onChange={(event) => onChange(assignment.id, { dueDate: event.target.value })}
          />
          <div className="flag-stack">
            <label className="mini-check">
              <input
                type="checkbox"
                checked={assignment.extraCredit === true}
                onChange={(event) => onChange(assignment.id, { extraCredit: event.target.checked })}
              />
              Extra
            </label>
            <label className="mini-check">
              <input
                type="checkbox"
                checked={assignment.finalExam === true}
                onChange={(event) => onChange(assignment.id, { finalExam: event.target.checked })}
              />
              Final
            </label>
          </div>
          <button className="icon-button" type="button" onClick={() => onRemove(assignment.id)} aria-label={`Remove ${assignment.name}`}>
            <Trash2 aria-hidden="true" size={16} />
          </button>
        </div>
      ))}
      <button className="secondary-button add-button" type="button" onClick={onAdd}>
        <Plus aria-hidden="true" size={16} />
        Add assignment
      </button>
    </div>
  );
}

function ResultsExplanation({ course, target }: { course: CourseGradeInput; target: string }) {
  const result = calculateGrade(course);
  const targetPercent = cleanNumber(target);
  const selectedNeed = targetPercent === null ? null : calculateGrade({
    ...course,
    letterScale: [{ letter: `${targetPercent}%`, minimum: targetPercent }, ...course.letterScale]
  }).finalNeeds.find((need) => need.targetLetter === `${targetPercent}%`);

  return (
    <div className="math-stack">
      <div className="metric-grid">
        <article>
          <span>Current</span>
          <strong>{displayPercent(result.currentPercent)}</strong>
          <p>{result.currentLetter ?? "No letter yet"}</p>
        </article>
        <article>
          <span>Projected</span>
          <strong>{displayPercent(result.projectedPercent)}</strong>
          <p>{result.projectedLetter ?? "No letter yet"}</p>
        </article>
        <article>
          <span>Final for target</span>
          <strong>{selectedNeed?.requiredFinalPercent === null || !selectedNeed ? "Need final weight" : `${selectedNeed.requiredFinalPercent.toFixed(2)}%`}</strong>
          <p>{targetPercent === null ? "Enter a numeric target." : `${targetPercent}% course target`}</p>
        </article>
      </div>

      <div className="formula-panel">
        <div>
          <Calculator aria-hidden="true" />
          <h3>Current grade</h3>
        </div>
        <p>
          {course.mode === "weighted"
            ? "For each category: category percent = earned points / possible points. Current grade = sum(category percent x category weight) / sum(weights with graded work)."
            : "Current grade = total earned graded points / total possible graded points."}
        </p>
        <p>Projection uses the same formula after counting ungraded rows as zero only when you enable that assumption.</p>
      </div>

      <div className="breakdown-list">
        {result.categoryBreakdown.map((category) => (
          <article key={category.categoryId}>
            <div>
              <h3>{category.name}</h3>
              <p>
                {formatPoints(category.earnedPoints)} / {formatPoints(category.possiblePoints)} points
                {category.droppedAssignmentIds.length > 0 ? `, ${category.droppedAssignmentIds.length} dropped` : ""}
                {category.ungradedCount > 0 ? `, ${category.ungradedCount} ungraded` : ""}
              </p>
            </div>
            <strong>{displayShortPercent(category.percent)}</strong>
            <span>{category.weight === null ? "points mode" : `${category.weight}% weight`}</span>
          </article>
        ))}
      </div>

      <div className="final-scenarios">
        {result.finalNeeds.slice(0, 4).map((need) => (
          <article key={need.targetLetter}>
            <span>{need.targetLetter} at {need.targetPercent}%</span>
            <strong>{need.requiredFinalPercent === null ? "Need final weight" : `${need.requiredFinalPercent.toFixed(2)}%`}</strong>
            {need.reason && <p>{need.reason}</p>}
          </article>
        ))}
      </div>

      <details className="assumption-details">
        <summary>
          <Info aria-hidden="true" size={16} />
          Data assumptions and validation
          <ChevronDown aria-hidden="true" size={16} />
        </summary>
        <div>
          {result.warnings.length === 0 && result.assumptions.length === 0 ? (
            <p><CheckCircle2 aria-hidden="true" size={16} /> No warnings. All current outputs are based on explicit graded inputs.</p>
          ) : [...result.warnings, ...result.assumptions].map((message) => (
            <p key={message}><AlertTriangle aria-hidden="true" size={16} /> {message}</p>
          ))}
        </div>
      </details>
    </div>
  );
}
