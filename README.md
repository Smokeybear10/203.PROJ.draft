# Draft | Resume Analysis and PDF Tools

Resume parsing, keyword review, job matching, workspace serialization, and PDF generation. The hosted app and browser frontend are retired; the core code and interface recordings remain here.

![Archived landing page](assets/landing-hero.gif)

![Archived application demo](assets/landing-demo.gif)

## Quick Start

The TypeScript core requires Node.js 24.

```bash
cd core
npm ci
npm test
npm run typecheck
```

The Python API can run locally:

```bash
pip install -r backend/requirements.txt
cd backend
uvicorn main:app --reload --port 3200
```

Open `http://localhost:3200/docs` for the API reference. AI analysis requires `XAI_API_KEY`; the optional `XAI_MODEL` defaults to `grok-4-fast-non-reasoning`.

## What It Does

The TypeScript modules extract selectable text from PDF and DOCX files, score section coverage and keyword matches, and compare a resume with a job posting. Workspace functions validate, serialize, migrate, and merge saved resume documents without a browser dependency.

PDF generation retains all five templates and bundled Latin and CJK fonts. `core/src/builder/pdf.ts` exports `createResumePdf`, which returns a PDF `Blob` using local font files by default.

The FastAPI backend retains resume analysis, optional xAI feedback, job-search links, and SQLite storage. Browser origins are disabled by default; a local API consumer can supply `ALLOWED_ORIGINS` explicitly if needed.

## Tech Stack

| Layer | Tools |
|---|---|
| Core | TypeScript, Node.js |
| PDF generation | React PDF, Noto fonts |
| File parsing | pdf-parse, Mammoth, JSZip |
| API | Python, FastAPI, Pydantic |
| AI | xAI Grok |
| Storage | SQLite |

## Project Structure

```text
core/
  src/builder/         Resume, workspace, and PDF modules with tests
  src/resume-review/   File parsing, scoring, and job matching with tests
  fonts/              PDF fonts and licenses
backend/              Local API, services, schemas, and storage
assets/               Archived interface recordings
DESIGN.md             Original interface design reference
```

Built by Thomas Ou
