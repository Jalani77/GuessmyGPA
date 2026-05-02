# GuessmyGPA

Import-first grade forecasting for students. The app parses gradebook exports or pasted tables, asks for confirmation when data is incomplete, and runs all grade math through a deterministic TypeScript engine.

## Features

- CSV upload, pasted gradebook tables, and syllabus/PDF rubric extraction.
- Honest iCollege surface: direct connection is not faked; students export CSV or paste the grade table until authorized access exists.
- Current numeric grade and letter grade front and center.
- Weighted-category and points-based grading.
- Dropped grades, extra credit, optional finals, missing/ungraded work, projection mode, custom letter scale, and final-exam target scenarios.
- One page: import panel, parsed-data review, results view, and optional edit drawer.
- Tests for calculation logic and import parsing.

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

## Important Assumptions

- Ungraded work is excluded from the current grade unless projection mode is enabled.
- If possible points or category weights are missing, the app warns and asks for confirmation instead of inventing values.
- PDF extraction works for selectable-text PDFs. Locked or scanned PDFs should be handled by pasting the rubric text or exporting the gradebook.
- iCollege direct integration requires institution-authorized API or LTI access. This app only provides an honest export/paste path until that access exists.

## Project Structure

- `app/` - Next.js app shell and global styles.
- `components/GradeApp.tsx` - the single-page import, review, results, and edit experience.
- `lib/grade-engine.ts` - deterministic grade calculations, separated from React.
- `lib/import-parser.ts` - CSV, pasted table, and syllabus/rubric parsing.
- `tests/` - Vitest coverage for math and parsing.
