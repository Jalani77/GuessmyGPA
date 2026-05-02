import { describe, expect, it } from "vitest";
import { parseGradebookText, parseSyllabusText } from "@/lib/import-parser";

describe("import parser", () => {
  it("parses CSV gradebook rows", () => {
    const parsed = parseGradebookText(`Assignment,Category,Earned,Possible
Quiz 1,Quizzes,9,10
Essay,Writing,44,50`, "csv");

    expect(parsed.course.assignments).toHaveLength(2);
    expect(parsed.course.assignments[0]).toMatchObject({ name: "Quiz 1", earned: 9, possible: 10 });
    expect(parsed.course.mode).toBe("points");
    expect(parsed.warnings).toEqual([]);
  });

  it("parses pasted tab-separated gradebook rows", () => {
    const parsed = parseGradebookText("Item\tType\tScore\tMax\nLab 1\tLabs\t18\t20", "paste");

    expect(parsed.course.categories[0].name).toBe("Labs");
    expect(parsed.course.assignments[0].possible).toBe(20);
  });

  it("detects category weights from gradebook columns", () => {
    const parsed = parseGradebookText(`Assignment,Category,Earned,Possible,Weight
Homework 1,Homework,10,10,40
Final Exam,Final,0,100,60`, "csv");

    expect(parsed.course.mode).toBe("weighted");
    expect(parsed.course.categories.find((category) => category.name === "Final")?.weight).toBe(60);
    expect(parsed.course.finalExamWeight).toBe(60);
  });

  it("parses score pairs without inventing numbers", () => {
    const parsed = parseGradebookText("Assignment,Score\nQuiz,8.5 / 10", "paste");

    expect(parsed.course.assignments[0].earned).toBe(8.5);
    expect(parsed.course.assignments[0].possible).toBe(10);
  });

  it("warns instead of guessing when possible points are missing", () => {
    const parsed = parseGradebookText("Assignment,Score\nMystery,10", "paste");

    expect(parsed.course.assignments[0].possible).toBe(0);
    expect(parsed.warnings[0].message).toContain("possible points missing");
  });

  it("extracts syllabus weights from plain text", () => {
    const parsed = parseSyllabusText(`Grading
Homework 25%
Midterm Exams 45%
Final Exam 30%`);

    expect(parsed.course.mode).toBe("weighted");
    expect(parsed.course.categories.map((category) => category.weight)).toEqual([25, 45, 30]);
    expect(parsed.course.finalExamWeight).toBe(30);
  });
});
