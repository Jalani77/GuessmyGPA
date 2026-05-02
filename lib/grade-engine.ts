import {
  Assignment,
  CategoryBreakdown,
  CourseGradeInput,
  defaultLetterScale,
  FinalNeed,
  GradeCategory,
  GradeResult,
  LetterBoundary
} from "./grade-types";

const round = (value: number, places = 2) => Number(value.toFixed(places));

export function letterForPercent(percent: number | null, scale: LetterBoundary[] = defaultLetterScale) {
  if (percent === null || Number.isNaN(percent)) return null;
  const sorted = [...scale].sort((a, b) => b.minimum - a.minimum);
  return sorted.find((boundary) => percent >= boundary.minimum)?.letter ?? sorted.at(-1)?.letter ?? null;
}

function usableAssignment(assignment: Assignment, includeUngradedAsZero: boolean) {
  if (assignment.possible < 0) return false;
  if (assignment.earned === null) return includeUngradedAsZero && assignment.possible > 0;
  return assignment.possible > 0 || assignment.extraCredit === true;
}

function scoreRatio(assignment: Assignment, includeUngradedAsZero: boolean) {
  const earned = assignment.earned ?? (includeUngradedAsZero ? 0 : null);
  if (earned === null || assignment.possible <= 0) return Number.POSITIVE_INFINITY;
  return earned / assignment.possible;
}

function dropLowest(assignments: Assignment[], dropCount: number, includeUngradedAsZero: boolean) {
  if (dropCount <= 0) return { kept: assignments, dropped: [] as Assignment[] };
  const droppable = assignments.filter((assignment) => !assignment.extraCredit && !assignment.finalExam);
  const dropped = [...droppable]
    .sort((a, b) => scoreRatio(a, includeUngradedAsZero) - scoreRatio(b, includeUngradedAsZero))
    .slice(0, dropCount);
  const droppedIds = new Set(dropped.map((assignment) => assignment.id));
  return {
    kept: assignments.filter((assignment) => !droppedIds.has(assignment.id)),
    dropped
  };
}

function pointsFor(assignments: Assignment[], includeUngradedAsZero: boolean) {
  return assignments.reduce(
    (total, assignment) => {
      if (!usableAssignment(assignment, includeUngradedAsZero)) return total;
      const earned = assignment.earned ?? 0;
      return {
        earned: total.earned + earned,
        possible: total.possible + (assignment.extraCredit ? 0 : assignment.possible)
      };
    },
    { earned: 0, possible: 0 }
  );
}

function categoryPercent(assignments: Assignment[], category: GradeCategory, includeUngradedAsZero: boolean) {
  const { kept, dropped } = dropLowest(assignments, category.dropLowest ?? 0, includeUngradedAsZero);
  const points = pointsFor(kept, includeUngradedAsZero);
  const percent = points.possible > 0 ? (points.earned / points.possible) * 100 : null;
  return { kept, dropped, points, percent };
}

function weightedCurrent(input: CourseGradeInput, includeUngradedAsZero: boolean) {
  const categories = input.categories.length
    ? input.categories
    : [{ id: "default", name: "Coursework", weight: 100 }];
  let usedWeight = 0;
  let weightedScore = 0;
  const breakdown: CategoryBreakdown[] = categories.map((category) => {
    const assignments = input.assignments.filter((assignment) =>
      input.categories.length ? assignment.categoryId === category.id : true
    );
    const ungradedCount = assignments.filter((assignment) => assignment.earned === null).length;
    const { dropped, points, percent } = categoryPercent(assignments, category, includeUngradedAsZero);
    const weight = category.weight ?? 0;
    if (percent !== null && weight > 0) {
      usedWeight += weight;
      weightedScore += percent * weight;
    }
    return {
      categoryId: category.id,
      name: category.name,
      weight,
      earnedPoints: round(points.earned),
      possiblePoints: round(points.possible),
      percent: percent === null ? null : round(percent),
      contribution: percent === null || weight <= 0 ? null : round((percent * weight) / 100),
      droppedAssignmentIds: dropped.map((assignment) => assignment.id),
      ungradedCount
    };
  });
  const currentPercent = usedWeight > 0 ? weightedScore / usedWeight : null;
  return { currentPercent, breakdown, usedWeight };
}

function pointsCurrent(input: CourseGradeInput, includeUngradedAsZero: boolean) {
  const byCategory = input.categories.length ? input.categories : [{ id: "all", name: "All work" }];
  const allKept: Assignment[] = [];
  const breakdown = byCategory.map((category) => {
    const assignments = input.categories.length
      ? input.assignments.filter((assignment) => assignment.categoryId === category.id)
      : input.assignments;
    const ungradedCount = assignments.filter((assignment) => assignment.earned === null).length;
    const { kept, dropped, points, percent } = categoryPercent(assignments, category, includeUngradedAsZero);
    allKept.push(...kept);
    return {
      categoryId: category.id,
      name: category.name,
      weight: null,
      earnedPoints: round(points.earned),
      possiblePoints: round(points.possible),
      percent: percent === null ? null : round(percent),
      contribution: null,
      droppedAssignmentIds: dropped.map((assignment) => assignment.id),
      ungradedCount
    };
  });
  const points = pointsFor(input.categories.length ? allKept : input.assignments, includeUngradedAsZero);
  return { currentPercent: points.possible > 0 ? (points.earned / points.possible) * 100 : null, breakdown };
}

function calculateFinalNeeds(input: CourseGradeInput, currentPercent: number | null): FinalNeed[] {
  const finalAssignment = input.assignments.find((assignment) => assignment.finalExam);
  const finalWeight = input.finalExamWeight ?? (finalAssignment?.categoryId
    ? input.categories.find((category) => category.id === finalAssignment.categoryId)?.weight
    : undefined);
  const targets = input.letterScale.filter((boundary) => boundary.minimum > 0);
  if (currentPercent === null) {
    return targets.map((target) => ({
      targetLetter: target.letter,
      targetPercent: target.minimum,
      requiredFinalPercent: null,
      possible: false,
      reason: "No graded work is available yet."
    }));
  }
  if (!finalWeight || finalWeight <= 0) {
    return targets.map((target) => ({
      targetLetter: target.letter,
      targetPercent: target.minimum,
      requiredFinalPercent: null,
      possible: false,
      reason: "Final exam weight is unknown."
    }));
  }
  const currentWeight = 100 - finalWeight;
  return targets.map((target) => {
    const required = (target.minimum - currentPercent * (currentWeight / 100)) / (finalWeight / 100);
    return {
      targetLetter: target.letter,
      targetPercent: target.minimum,
      requiredFinalPercent: round(required),
      possible: required <= 100 && required >= 0,
      reason: required < 0 ? "Already secured before the final." : required > 100 ? "Requires more than 100% on the final." : undefined
    };
  });
}

export function calculateGrade(input: CourseGradeInput): GradeResult {
  const letterScale = input.letterScale.length ? input.letterScale : defaultLetterScale;
  const includeUngradedAsZero = input.includeUngradedAsZero === true;
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const ungradedCount = input.assignments.filter((assignment) => assignment.earned === null).length;
  const missingPossible = input.assignments.filter((assignment) => assignment.possible <= 0 && !assignment.extraCredit).length;

  if (ungradedCount && !includeUngradedAsZero) {
    assumptions.push(`${ungradedCount} ungraded item${ungradedCount === 1 ? "" : "s"} excluded from current grade.`);
  }
  if (includeUngradedAsZero && ungradedCount) {
    assumptions.push(`${ungradedCount} ungraded item${ungradedCount === 1 ? "" : "s"} counted as zero for projection.`);
  }
  if (missingPossible) {
    warnings.push(`${missingPossible} item${missingPossible === 1 ? " has" : "s have"} no possible points and cannot affect the grade.`);
  }
  if (input.mode === "weighted") {
    const knownWeight = input.categories.reduce((sum, category) => sum + (category.weight ?? 0), 0);
    if (knownWeight !== 100) warnings.push(`Known category weights total ${round(knownWeight)}%, not 100%. Results normalize graded categories only.`);
  }

  const current = input.mode === "weighted"
    ? weightedCurrent(input, includeUngradedAsZero)
    : pointsCurrent(input, includeUngradedAsZero);
  const currentPercent = current.currentPercent === null ? null : round(current.currentPercent);
  const projectedInput = { ...input, includeUngradedAsZero: true };
  const projected = input.mode === "weighted" ? weightedCurrent(projectedInput, true) : pointsCurrent(projectedInput, true);
  const projectedPercent = projected.currentPercent === null ? null : round(projected.currentPercent);

  return {
    currentPercent,
    currentLetter: letterForPercent(currentPercent, letterScale),
    projectedPercent,
    projectedLetter: letterForPercent(projectedPercent, letterScale),
    categoryBreakdown: current.breakdown,
    finalNeeds: calculateFinalNeeds({ ...input, letterScale }, currentPercent),
    warnings,
    assumptions
  };
}
