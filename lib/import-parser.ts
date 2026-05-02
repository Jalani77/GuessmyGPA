import Papa from "papaparse";
import { Assignment, CourseGradeInput, defaultLetterScale, GradeCategory } from "./grade-types";

export type ImportWarning = {
  level: "warning" | "error";
  message: string;
};

export type ParsedGradebook = {
  course: CourseGradeInput;
  warnings: ImportWarning[];
  source: "csv" | "paste" | "syllabus" | "manual";
};

const normalize = (value: unknown) => String(value ?? "").trim();
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
const parseNumber = (value: unknown) => {
  const text = normalize(value).replace(/%/g, "");
  if (!text || /^(-|n\/a|na|missing|ungraded)$/i.test(text)) return null;
  if (text.includes("/")) return null;
  const number = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : null;
};
const parseScorePair = (value: unknown) => {
  const text = normalize(value);
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const earned = Number(match[1]);
  const possible = Number(match[2]);
  return Number.isFinite(earned) && Number.isFinite(possible) ? { earned, possible } : null;
};

function pick(row: Record<string, unknown>, names: string[]) {
  const entries = Object.entries(row);
  const found = entries.find(([key]) => names.some((name) => key.toLowerCase().includes(name)));
  return found?.[1];
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find(Boolean) ?? "";
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes("|")) return "|";
  return ",";
}

function rowsFromText(text: string) {
  const delimiter = detectDelimiter(text);
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter
  });
  return parsed.data.filter((row) => Object.values(row).some((value) => normalize(value)));
}

function categoryIdFor(name: string, categories: Map<string, GradeCategory>) {
  const cleanName = name || "Coursework";
  const id = slug(cleanName);
  if (!categories.has(id)) categories.set(id, { id, name: cleanName });
  return id;
}

export function parseGradebookText(text: string, source: ParsedGradebook["source"] = "paste"): ParsedGradebook {
  const warnings: ImportWarning[] = [];
  const rows = rowsFromText(text);
  const categories = new Map<string, GradeCategory>();
  const assignments: Assignment[] = [];

  rows.forEach((row, index) => {
    const name = normalize(pick(row, ["assignment", "activity", "item", "name", "title"])) || `Imported item ${index + 1}`;
    const categoryName = normalize(pick(row, ["category", "group", "type"]));
    const scoreValue = pick(row, ["earned", "score", "points received", "grade"]);
    const scorePair = parseScorePair(scoreValue);
    const earned = scorePair?.earned ?? parseNumber(scoreValue);
    let possible = scorePair?.possible ?? parseNumber(pick(row, ["possible", "max", "points possible", "out of", "total"]));
    const percent = parseNumber(pick(row, ["percent", "%"]));
    const weight = parseNumber(pick(row, ["weight"]));
    const categoryId = categoryIdFor(categoryName || "Coursework", categories);

    if (weight !== null) {
      const category = categories.get(categoryId);
      if (category) category.weight = weight > 1 ? weight : weight * 100;
    }
    if (possible === null && earned !== null && percent !== null && percent > 0) {
      possible = earned / (percent / 100);
      warnings.push({ level: "warning", message: `${name}: possible points inferred from score and percent.` });
    }
    if (possible === null) {
      possible = 0;
      warnings.push({ level: "warning", message: `${name}: possible points missing; confirm before relying on results.` });
    }

    assignments.push({
      id: `${slug(name)}-${index}`,
      name,
      categoryId,
      earned,
      possible,
      extraCredit: /extra credit/i.test(name) || possible === 0,
      finalExam: /final/i.test(name),
      missing: earned === null
    });
  });

  if (!assignments.length) {
    warnings.push({ level: "error", message: "No assignment rows were detected. Paste a table with assignment, score, and possible columns." });
  }

  const categoryList = Array.from(categories.values());
  const hasAnyWeight = categoryList.some((category) => category.weight !== undefined);
  return {
    source,
    warnings,
    course: {
      mode: hasAnyWeight ? "weighted" : "points",
      categories: categoryList,
      assignments,
      letterScale: defaultLetterScale,
      finalExamWeight: categoryList.find((category) => /final/i.test(category.name))?.weight
    }
  };
}

export function parseSyllabusText(text: string): ParsedGradebook {
  const warnings: ImportWarning[] = [];
  const categories = new Map<string, GradeCategory>();
  const weightPattern = /^(.{3,80}?)\s+(\d+(?:\.\d+)?)\s*%$/gm;
  let match: RegExpExecArray | null;
  while ((match = weightPattern.exec(text)) !== null) {
    const name = match[1].replace(/[-:•]/g, "").trim();
    const weight = Number(match[2]);
    if (name && Number.isFinite(weight)) categories.set(slug(name), { id: slug(name), name, weight });
  }
  const finalMatch = text.match(/final(?:\s+exam)?[^0-9%]{0,24}(\d+(?:\.\d+)?)\s*%/i);
  if (!categories.size) {
    warnings.push({ level: "warning", message: "No clear category weights found. Paste the grading scale section or enter weights manually." });
  }
  return {
    source: "syllabus",
    warnings,
    course: {
      mode: categories.size ? "weighted" : "points",
      categories: Array.from(categories.values()),
      assignments: [],
      letterScale: defaultLetterScale,
      finalExamWeight: finalMatch ? Number(finalMatch[1]) : undefined
    }
  };
}
