# DSA Progress Hub

A production-ready Next.js + Supabase dashboard for two independent practice tracks:

- Official DSA syllabus: 355 questions
- Company Placement track: 281 questions (Unthinkable Solutions LLP • Daffodil Software)
- My Questions: user-scoped custom practice, excluded from official counts

## Run

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and fill the Supabase URL + anon key.
4. Install dependencies with `npm install`.
5. Seed official question tables using the service-role key:

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
```

6. Start with `npm run dev`.

## Important architecture

Official question records are bundled from the supplied prompt files and also seeded into their own Supabase tables. Progress, notes and activity are user-scoped. DSA, Placement and My Questions use separate progress/count/activity storage and never share official totals.

## Included UX

Authentication, session persistence, theme toggle, dashboard stats, separate DSA/Placement charts, 364-day activity heatmaps, combined recent activity labels, multi-filter search, solved/hint/solution status controls, private autosaving notes, question detail drawer, My Questions add/edit/delete, and responsive mobile sidebar.

## Source fidelity

`lib/dsaQuestions.json` contains the 355 DSA rows and `lib/placementQuestions.json` contains the 281 Placement rows extracted field-for-field from the provided prompt files. No questions are generated outside those source lists for the official modules.
