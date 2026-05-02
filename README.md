# GuessmyGPA

A single-page student grade calculator built with Next.js, React, TypeScript, Tailwind CSS, and a deterministic calculation engine. The product is designed to feel calm, premium, and trustworthy: students can import or enter course data, see where they stand, and understand the exact math behind every number.

## What It Does

- Imports CSV/TXT/TSV gradebooks, pasted tables, and selectable-text syllabus/PDF rubrics.
- Supports manual assignment entry with category, earned points, possible points, graded/ungraded status, due date, extra credit, and final-exam flags.
- Supports quick category setup for students who only know category weights and averages.
- Calculates current grade from graded work only.
- Calculates projected grade with ungraded work counted as zero only when the user enables that assumption.
- Calculates the final exam score needed for A/B/C and a custom target.
- Supports weighted categories, total-points grading, dropped lowest grades, extra credit, classes with or without finals, and custom letter scales.
- Shows warnings instead of silently guessing when possible points, weights, or final information are missing.

## Product Principles

- No hallucinated outputs: every result comes from explicit user data.
- No hidden assumptions: incomplete data appears as a warning or assumption.
- No fake integrations: school LMS access requires authorized APIs or LTI; until then, students can export CSV or paste grade tables.
- One focused workflow: import, quick setup, manual edit, rubric review, and math explanation on a single page.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Test

```bash
npm test
```

## Project Structure

- `app/` - Next.js app shell, metadata, and global visual system.
- `components/GradeApp.tsx` - the single-page product experience.
- `lib/grade-engine.ts` - deterministic grade calculation logic.
- `lib/import-parser.ts` - CSV, pasted table, and syllabus/rubric parsing.
- `lib/grade-types.ts` - shared course, category, assignment, and result types.
- `tests/` - Vitest coverage for math and parsing.
- `tailwind.config.ts` and `postcss.config.mjs` - Tailwind/PostCSS build wiring.

## Important Math Notes

- Current grade excludes ungraded work by default.
- Projected grade includes ungraded work as zero only if the projection toggle is enabled.
- Weighted current grade normalizes over categories that have graded work.
- Final exam needs use the known final exam weight. If the final weight is missing, the UI reports that instead of inventing it.
