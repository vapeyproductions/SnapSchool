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
- Sends parent-configurable due-date, urgent-workload, or daily progress emails

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

3. Fill in `.env.local` with credentials from your Firebase, Stream, and OpenAI projects. Parent progress emails additionally require Firebase Admin, Resend, and `CRON_SECRET` values. Never commit this file.

4. Enable Email/Password authentication and Cloud Firestore in Firebase, then deploy the included Firestore rules as appropriate for your Firebase project.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## Environment variables

The required variable names are documented in `.env.example`. Variables beginning with `NEXT_PUBLIC_` are included in browser code. OpenAI, Stream, Firebase Admin, Resend, and cron secrets must remain server-only. Verify the sender domain used by `SNAPSCHOOL_EMAIL_FROM` with your email provider before enabling parent emails.

## Verification

```bash
npm run lint
npm run build
```

## Parent progress email setup

Parent email preferences are stored in Firestore and a protected Vercel Cron job checks them once each day. To activate delivery in production:

1. Deploy `firestore.rules` to the Firebase project.
2. Create a Firebase service-account credential and add its client email and private key to Vercel as `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`.
3. Verify a sender domain with Resend, create a sending-only API key, and set `RESEND_API_KEY` plus `SNAPSCHOOL_EMAIL_FROM` in Vercel.
4. Add a random `CRON_SECRET` of at least 16 characters and set `NEXT_PUBLIC_APP_URL` to the production `/chat` URL.
5. Redeploy. Vercel registers the daily schedule from `vercel.json` for production deployments.

All email-related credentials are server-only. Never prefix them with `NEXT_PUBLIC_` or commit their values.

## Project status

SnapSchool is an active hackathon prototype. Before using it with real student information, complete a dedicated privacy, security, accessibility, and school-policy review.
