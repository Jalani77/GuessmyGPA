export type GradingMode = "weighted" | "points";

export type LetterBoundary = {
  letter: string;
  minimum: number;
};

export type GradeCategory = {
  id: string;
  name: string;
  weight?: number;
  dropLowest?: number;
};

export type Assignment = {
  id: string;
  name: string;
  categoryId?: string;
  earned: number | null;
  possible: number;
  dueDate?: string;
  graded?: boolean;
  extraCredit?: boolean;
  finalExam?: boolean;
  missing?: boolean;
  source?: "manual" | "import" | "quick-category";
};

export type CourseGradeInput = {
  mode: GradingMode;
  categories: GradeCategory[];
  assignments: Assignment[];
  letterScale: LetterBoundary[];
  includeUngradedAsZero?: boolean;
  finalExamWeight?: number;
};

export type CategoryBreakdown = {
  categoryId: string;
  name: string;
  weight: number | null;
  earnedPoints: number;
  possiblePoints: number;
  percent: number | null;
  contribution: number | null;
  droppedAssignmentIds: string[];
  ungradedCount: number;
};

export type FinalNeed = {
  targetLetter: string;
  targetPercent: number;
  requiredFinalPercent: number | null;
  possible: boolean;
  reason?: string;
};

export type GradeResult = {
  currentPercent: number | null;
  currentLetter: string | null;
  projectedPercent: number | null;
  projectedLetter: string | null;
  categoryBreakdown: CategoryBreakdown[];
  finalNeeds: FinalNeed[];
  warnings: string[];
  assumptions: string[];
};

export const defaultLetterScale: LetterBoundary[] = [
  { letter: "A", minimum: 90 },
  { letter: "B", minimum: 80 },
  { letter: "C", minimum: 70 },
  { letter: "D", minimum: 60 },
  { letter: "F", minimum: 0 }
];
