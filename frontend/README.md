# Screening Tool Frontend

Enterprise-grade React frontend for OFAC screening workflows.

## Stack

- React 19 + TypeScript + Vite
- Material UI + Emotion
- React Router
- TanStack Query + Axios
- Framer Motion
- React Hook Form + Zod
- MUI Data Grid + Recharts
- PapaParse + FileSaver + React Hot Toast
- Clerk React auth + Organizations
- Vitest + Testing Library

## Run

```bash
npm install
npm run dev
```

## Environment

Create `.env` from `.env.example`.

```bash
VITE_API_BASE_URL=/api
VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
```

The app requires a signed-in Clerk user with an active Organization. API requests include the Clerk session token as a bearer token; the backend enforces tenant isolation with the active organization id.

## API Assumptions

This frontend assumes backend endpoints are exposed behind `/api` and include:

- `POST /api/screen`
- `POST /api/screen/bulk`
- `GET /api/results`
- `GET /api/results/{id}`
- `GET /api/reports/{id}/download`
- `GET /api/reports/download-all`
- `GET /api/audit-logs`
- `GET /api/dashboard/stats`
- `GET /api/dashboard/charts`

If your backend uses different paths, set `VITE_API_BASE_URL` and/or adjust route mapping in `src/services/api.ts`.
