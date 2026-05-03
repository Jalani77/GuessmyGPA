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
import { Assignment, CourseGradeInput, defaultLetterScale, FinalNeed, GradeCategory, GradeResult, LetterBoundary } from "@/lib/grade-types";
import { ImportWarning, parseGradebookText, parseSyllabusText } from "@/lib/import-parser";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

type InputMode = "quick" | "manual" | "import";
type CompactMessage = { level: "warning" | "error"; message: string };

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
  const [activeInput, setActiveInput] = useState<InputMode>("quick");
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
  const tableRows = course.assignments.filter((assignment) => assignment.source !== "quick-category");
  const messages: CompactMessage[] = [
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#workspace" aria-label="GuessmyGPA home">
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
          <button className="text-button" type="button" onClick={() => {
            setCourse(emptyCourse());
            setWarnings([]);
            setPaste("");
            setActiveInput("quick");
          }}>
            Reset
          </button>
        </div>
      </header>

      <section className="workspace-intro" aria-label="Grade calculator purpose">
        <div>
          <p className="eyebrow">Student grade calculator</p>
          <h1>Input grades, pick a target, see the final score you need.</h1>
        </div>
        <div className="status-pills" aria-label="Current course data status">
          <span>{gradedAssignments.length} graded</span>
          <span>{ungradedAssignments.length} ungraded</span>
          <span>{course.mode === "weighted" ? `${totalWeight}% weights` : "points mode"}</span>
        </div>
      </section>

      <section className="calculator-workspace" id="workspace" aria-label="Grade calculator workspace">
        <div className="result-column">
          <ResultSummary
            result={result}
            customNeed={customNeed}
            target={target}
            onTargetChange={setTarget}
            course={course}
            onCourseChange={updateCourse}
            gradedCount={gradedAssignments.length}
            ungradedCount={ungradedAssignments.length}
          />
          <CompactWarnings messages={messages} />
        </div>

        <div className="input-column">
          <InputModeTabs activeInput={activeInput} onChange={setActiveInput} />
          <div className="input-panel">
            {activeInput === "quick" && (
              <QuickCategoryForm
                course={course}
                onCategoryChange={updateCategory}
                onAverageChange={setQuickAverage}
                onRemove={removeCategory}
                onAdd={addCategory}
              />
            )}
            {activeInput === "manual" && (
              <ManualAssignmentsPanel
                assignments={tableRows}
                categories={course.categories}
                onAdd={addAssignment}
                onRemove={removeAssignment}
                onChange={updateAssignment}
              />
            )}
            {activeInput === "import" && (
              <ImportPanel
                busy={busy}
                paste={paste}
                onPasteChange={setPaste}
                onFileChange={handleFile}
                onParseGradebook={() => applyParsed(parseGradebookText(paste, "paste"))}
                onParseSyllabus={() => applyParsed(parseSyllabusText(paste))}
              />
            )}
          </div>
        </div>
      </section>

      <BreakdownDrawer
        course={course}
        result={result}
        target={target}
        onCourseChange={updateCourse}
        onLetterScaleChange={updateLetterScale}
      />
    </main>
  );
}

function ResultSummary({
  result,
  customNeed,
  target,
  onTargetChange,
  course,
  onCourseChange,
  gradedCount,
  ungradedCount
}: {
  result: GradeResult;
  customNeed: FinalNeed | null;
  target: string;
  onTargetChange: (value: string) => void;
  course: CourseGradeInput;
  onCourseChange: (patch: Partial<CourseGradeInput>) => void;
  gradedCount: number;
  ungradedCount: number;
}) {
  const needLabel = customNeed?.requiredFinalPercent === null || !customNeed
    ? "Need final weight"
    : `${customNeed.requiredFinalPercent.toFixed(2)}%`;

  return (
    <article className="result-card" aria-label="Current grade and final target">
      <div className="result-card-head">
        <div>
          <p className="section-label">Live result</p>
          <h2>Current standing</h2>
        </div>
        <strong className="letter-badge">{result.currentLetter ?? "--"}</strong>
      </div>

      <div className="grade-hero">
        <span>Current grade</span>
        <strong>{displayPercent(result.currentPercent)}</strong>
        <p>Excludes ungraded work unless projection is enabled.</p>
      </div>

      <div className="need-card">
        <div>
          <span>Needed on final</span>
          <strong>{needLabel}</strong>
          <p>{customNeed?.reason ?? "Calculated from your target grade and final exam weight."}</p>
        </div>
        <label className="target-control compact-target">
          <span>Target grade</span>
          <input
            value={target}
            inputMode="decimal"
            aria-label="Target course percentage"
            onChange={(event) => onTargetChange(event.target.value)}
          />
          <b>%</b>
        </label>
      </div>

      <div className="assumption-grid">
        <label>
          <span>Final weight</span>
          <input
            value={course.finalExamWeight ?? ""}
            inputMode="decimal"
            placeholder="Unknown"
            aria-label="Final exam weight"
            onChange={(event) => onCourseChange({ finalExamWeight: cleanNumber(event.target.value) ?? undefined })}
          />
        </label>
        <label>
          <span>Math mode</span>
          <select value={course.mode} onChange={(event) => onCourseChange({ mode: event.target.value as CourseGradeInput["mode"] })}>
            <option value="weighted">Weighted</option>
            <option value="points">Points</option>
          </select>
        </label>
      </div>

      <div className="mini-breakdown" aria-label="Graded and ungraded counts">
        <span>{gradedCount} graded inputs</span>
        <span>{ungradedCount} excluded or projected</span>
        <label className="mini-check">
          <input
            type="checkbox"
            checked={course.includeUngradedAsZero === true}
            onChange={(event) => onCourseChange({ includeUngradedAsZero: event.target.checked })}
          />
          Count ungraded as zero
        </label>
      </div>
    </article>
  );
}

function InputModeTabs({ activeInput, onChange }: { activeInput: InputMode; onChange: (mode: InputMode) => void }) {
  const methods = [
    { id: "quick" as const, icon: SlidersHorizontal, title: "Quick categories" },
    { id: "manual" as const, icon: BookOpen, title: "Manual assignments" },
    { id: "import" as const, icon: Upload, title: "Import" }
  ];

  return (
    <div className="input-methods" role="tablist" aria-label="Choose how to enter grade data">
      {methods.map((method) => {
        const Icon = method.icon;
        return (
          <button
            className={activeInput === method.id ? "method active" : "method"}
            key={method.id}
            type="button"
            role="tab"
            aria-selected={activeInput === method.id}
            onClick={() => onChange(method.id)}
          >
            <Icon aria-hidden="true" size={16} />
            <span>{method.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function ImportPanel({
  busy,
  paste,
  onPasteChange,
  onFileChange,
  onParseGradebook,
  onParseSyllabus
}: {
  busy: boolean;
  paste: string;
  onPasteChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onParseGradebook: () => void;
  onParseSyllabus: () => void;
}) {
  return (
    <section className="compact-panel import-panel" aria-labelledby="import-heading">
      <div className="panel-title">
        <p className="section-label">Import</p>
        <h2 id="import-heading">Upload or paste grade data.</h2>
        <p>CSV, pasted tables, or syllabus/PDF rubric text. Parsing stays local.</p>
      </div>
      <div className="import-grid">
        <label className="dropzone">
          {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" size={20} />}
          <span>{busy ? "Reading file..." : "Upload CSV, TXT, TSV, or PDF"}</span>
          <input accept=".csv,.txt,.tsv,.pdf,text/csv,application/pdf" type="file" onChange={onFileChange} />
        </label>
        <label>
          Paste gradebook text
          <textarea
            value={paste}
            onChange={(event) => onPasteChange(event.target.value)}
            placeholder={"Assignment, Category, Earned, Possible, Weight\nQuiz 1, Quizzes, 9, 10, 15"}
          />
        </label>
      </div>
      <div className="actions-row">
        <button className="primary-button" type="button" disabled={!paste.trim() || busy} onClick={onParseGradebook}>
          Parse grades
        </button>
        <button className="secondary-button" type="button" onClick={onParseSyllabus} disabled={!paste.trim() || busy}>
          Parse syllabus
        </button>
      </div>
    </section>
  );
}

function QuickCategoryForm({
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
    <section className="compact-panel" aria-labelledby="quick-heading">
      <div className="panel-title">
        <p className="section-label">Fast input</p>
        <h2 id="quick-heading">Enter category averages.</h2>
        <p>Use this when you know each category average and weight.</p>
      </div>
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
      </div>
      <button className="secondary-button add-button" type="button" onClick={onAdd}>
        <Plus aria-hidden="true" size={16} />
        Add category
      </button>
    </section>
  );
}

function ManualAssignmentsPanel({
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
    <section className="compact-panel" aria-labelledby="manual-heading">
      <div className="panel-title split-title">
        <div>
          <p className="section-label">Detailed input</p>
          <h2 id="manual-heading">Manual assignments</h2>
          <p>Rows stay contained here so results remain visible.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onAdd}>
          <Plus aria-hidden="true" size={16} />
          Add row
        </button>
      </div>
      <div className="table-scroll">
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
        </div>
      </div>
    </section>
  );
}

function CompactWarnings({ messages }: { messages: CompactMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="message-strip success" aria-live="polite">
        <p>
          <CheckCircle2 aria-hidden="true" size={15} />
          Results are based on explicit graded inputs.
        </p>
      </div>
    );
  }

  return (
    <div className="message-strip" aria-live="polite">
      {messages.slice(0, 3).map((message) => (
        <p key={message.message} className={message.level === "error" ? "error" : ""}>
          <AlertTriangle aria-hidden="true" size={15} />
          {message.message}
        </p>
      ))}
      {messages.length > 3 && <p>+{messages.length - 3} more notes in details.</p>}
    </div>
  );
}

function BreakdownDrawer({
  course,
  result,
  target,
  onCourseChange,
  onLetterScaleChange
}: {
  course: CourseGradeInput;
  result: GradeResult;
  target: string;
  onCourseChange: (patch: Partial<CourseGradeInput>) => void;
  onLetterScaleChange: (index: number, patch: Partial<LetterBoundary>) => void;
}) {
  const targetPercent = cleanNumber(target);
  const selectedNeed = targetPercent === null ? null : calculateGrade({
    ...course,
    letterScale: [{ letter: `${targetPercent}%`, minimum: targetPercent }, ...course.letterScale]
  }).finalNeeds.find((need) => need.targetLetter === `${targetPercent}%`);

  return (
    <details className="details-drawer">
      <summary>
        <span>
          <Info aria-hidden="true" size={16} />
          Show breakdown, letter scale, and formulas
        </span>
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="drawer-grid">
        <section className="drawer-panel" aria-label="Category breakdown">
          <h2>Breakdown</h2>
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
                <span>{category.weight === null ? "points" : `${category.weight}%`}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="drawer-panel" aria-label="Final scenarios and settings">
          <h2>Final targets</h2>
          <div className="final-scenarios">
            {result.finalNeeds.slice(0, 4).map((need) => (
              <article key={need.targetLetter} className={selectedNeed?.targetLetter === need.targetLetter ? "selected" : undefined}>
                <span>{need.targetLetter} at {need.targetPercent}%</span>
                <strong>{need.requiredFinalPercent === null ? "Need weight" : `${need.requiredFinalPercent.toFixed(2)}%`}</strong>
                {need.reason && <p>{need.reason}</p>}
              </article>
            ))}
          </div>
          <div className="formula-panel">
            <div>
              <Calculator aria-hidden="true" size={16} />
              <h3>Formula</h3>
            </div>
            <p>
              {course.mode === "weighted"
                ? "Current grade normalizes categories with graded work. Final need uses target = current non-final grade x remaining weight + final score x final weight."
                : "Current grade = total earned graded points / total possible graded points. Final need uses the final exam weight when provided."}
            </p>
          </div>
        </section>

        <section className="drawer-panel" aria-label="Advanced rubric settings">
          <h2>Advanced rubric</h2>
          <div className="scale-panel compact-scale">
            {course.letterScale.map((boundary, index) => (
              <div className="scale-row" key={`${boundary.letter}-${index}`}>
                <input
                  value={boundary.letter}
                  aria-label={`Letter name ${index + 1}`}
                  onChange={(event) => onLetterScaleChange(index, { letter: event.target.value })}
                />
                <input
                  value={boundary.minimum}
                  inputMode="decimal"
                  aria-label={`${boundary.letter} minimum percentage`}
                  onChange={(event) => onLetterScaleChange(index, { minimum: cleanNumber(event.target.value) ?? 0 })}
                />
              </div>
            ))}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={course.includeUngradedAsZero === true}
              onChange={(event) => onCourseChange({ includeUngradedAsZero: event.target.checked })}
            />
            Count ungraded work as zero for projection
          </label>
        </section>
      </div>
    </details>
  );
}
