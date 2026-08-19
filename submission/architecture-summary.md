# Architecture summary

```text
Protected video + canonical transcript
  -> full-transcript Lecture Intelligence
  -> validated events and Q-A relations
  -> human review and audit
  -> Semantic Timeline / Context Recovery / Grounded Ask
  -> source-aware Summary / Highlights / Flashcards / Quiz
```

FastAPI is the authorization, evidence, and timestamp authority. Next.js renders the authenticated learning journey. SQLModel/Alembic persist course, progress, event, relation, review, and learning records. Provider output is validated against canonical source IDs; the backend derives all citations. Private media uses protected local storage or optional private S3. Redis/RQ is optional for background jobs.
