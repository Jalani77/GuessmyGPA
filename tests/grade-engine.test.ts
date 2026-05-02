import { describe, expect, it } from "vitest";
import { calculateGrade, letterForPercent } from "@/lib/grade-engine";
import { defaultLetterScale } from "@/lib/grade-types";

describe("grade engine", () => {
  it("calculates points-based current grade and excludes ungraded work by default", () => {
    const result = calculateGrade({
      mode: "points",
      categories: [{ id: "all", name: "All work", dropLowest: 0 }],
      assignments: [
        { id: "quiz-1", name: "Quiz 1", categoryId: "all", earned: 8, possible: 10 },
        { id: "quiz-2", name: "Quiz 2", categoryId: "all", earned: null, possible: 10 }
      ],
      letterScale: defaultLetterScale
    });

    expect(result.currentPercent).toBe(80);
    expect(result.projectedPercent).toBe(40);
    expect(result.currentLetter).toBe("B");
    expect(result.assumptions).toContain("1 ungraded item excluded from current grade.");
  });

  it("calculates weighted categories and normalizes categories with graded work", () => {
    const result = calculateGrade({
      mode: "weighted",
      categories: [
        { id: "homework", name: "Homework", weight: 40 },
        { id: "tests", name: "Tests", weight: 60 }
      ],
      assignments: [
        { id: "hw", name: "HW", categoryId: "homework", earned: 9, possible: 10 },
        { id: "test", name: "Test", categoryId: "tests", earned: 80, possible: 100 }
      ],
      letterScale: defaultLetterScale
    });

    expect(result.currentPercent).toBe(84);
    expect(result.categoryBreakdown[0].contribution).toBe(36);
    expect(result.categoryBreakdown[1].contribution).toBe(48);
  });

  it("drops the lowest score inside a category", () => {
    const result = calculateGrade({
      mode: "points",
      categories: [{ id: "quiz", name: "Quizzes", dropLowest: 1 }],
      assignments: [
        { id: "q1", name: "Q1", categoryId: "quiz", earned: 2, possible: 10 },
        { id: "q2", name: "Q2", categoryId: "quiz", earned: 9, possible: 10 },
        { id: "q3", name: "Q3", categoryId: "quiz", earned: 10, possible: 10 }
      ],
      letterScale: defaultLetterScale
    });

    expect(result.currentPercent).toBe(95);
    expect(result.categoryBreakdown[0].droppedAssignmentIds).toEqual(["q1"]);
  });

  it("keeps extra credit in earned points without adding possible points", () => {
    const result = calculateGrade({
      mode: "points",
      categories: [{ id: "all", name: "All" }],
      assignments: [
        { id: "exam", name: "Exam", categoryId: "all", earned: 90, possible: 100 },
        { id: "ec", name: "Extra credit", categoryId: "all", earned: 5, possible: 0, extraCredit: true }
      ],
      letterScale: defaultLetterScale
    });

    expect(result.currentPercent).toBe(95);
    expect(result.currentLetter).toBe("A");
  });

  it("calculates required final exam score from known final weight", () => {
    const result = calculateGrade({
      mode: "weighted",
      categories: [{ id: "work", name: "Work", weight: 80 }, { id: "final", name: "Final", weight: 20 }],
      assignments: [{ id: "work", name: "Work", categoryId: "work", earned: 85, possible: 100 }],
      letterScale: defaultLetterScale,
      finalExamWeight: 20
    });

    expect(result.finalNeeds.find((need) => need.targetLetter === "A")?.requiredFinalPercent).toBe(110);
    expect(result.finalNeeds.find((need) => need.targetLetter === "B")?.requiredFinalPercent).toBe(60);
  });

  it("uses custom letter scales deterministically", () => {
    expect(letterForPercent(92, [{ letter: "Pass", minimum: 70 }, { letter: "No Pass", minimum: 0 }])).toBe("Pass");
  });
});
