# SnapSchool

SnapSchool turns assignments into manageable daily progress plans. Teachers can create classes, assign work, monitor student progress, and answer assignment-specific questions. Students get an urgency-ranked dashboard with class color coding, daily goals, progress submissions, and AI-assisted plan adjustments.

## What it does

- Supports student and administrator accounts
- Lets administrators create and edit class rosters
- Creates individual assignments for an entire class without entering usernames one by one
- Accepts assignment descriptions, screenshots, and documents for AI analysis
- Produces due-date-aware daily task plans, including study plans for tests
- Prioritizes assignments by urgency, remaining work, and due date
- Lets students submit evidence of progress for AI review and plan recalibration
- Provides assignment-specific chat between students and administrators
- Tracks completion and highlights overdue work that needs intervention

## Built with

- Next.js, React, TypeScript, and Tailwind CSS
- Firebase Authentication and Cloud Firestore
- Stream Chat
- OpenAI Responses API
- date-fns and shadcn/ui

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in `.env.local` with credentials from your Firebase, Stream, and OpenAI projects. Never commit this file.

4. Enable Email/Password authentication and Cloud Firestore in Firebase, then deploy the included Firestore rules as appropriate for your Firebase project.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## Environment variables

The required variable names are documented in `.env.example`. Variables beginning with `NEXT_PUBLIC_` are included in browser code; `OPENAI_API_KEY` and `STREAM_SECRET_KEY` must remain server-only secrets.

## Verification

```bash
npm run lint
npm run build
```

## Project status

SnapSchool is an active hackathon prototype. Before using it with real student information, complete a dedicated privacy, security, accessibility, and school-policy review.
