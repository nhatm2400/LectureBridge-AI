# Privacy and Security

## Data flow

```text
authenticated user
  -> protected upload or validated public URL
  -> private local storage or optional private S3
  -> local FFmpeg and speech recognition
  -> bounded configured-provider payloads
  -> private database and learning artifacts
  -> authorization-checked playback and learning APIs
```

Original media and extracted audio remain in the configured private storage path. Semantic extraction and learning features may send bounded transcript evidence to the configured provider. Context Recovery sends only its bounded window; Grounded Ask sends the learner question and selected current-lecture evidence.

## Application controls

- Authentication uses an HttpOnly cookie; browser persistence does not store bearer tokens.
- Protected media is never exposed through a static mount.
- Server-owned IDs determine storage paths and evidence ownership.
- Private responses use authorization checks and no-store caching where applicable.
- Upload size, media type, duration, URL handling, request rate, and deletion scope are validated.
- Lesson deletion removes dependent data and best-effort local/S3 artifacts while retaining a sanitized deletion audit.

## Secrets

`GEMINI_API_KEY`, database credentials, JWT signing material, cloud credentials, and Terraform variables belong only in the ignored `.env`, a deployment secret store, or ignored Terraform variable files. `.env.example` contains placeholders. Provider credentials must never use a `NEXT_PUBLIC_` name or appear in logs, screenshots, review files, generated results, or frontend bundles.

## Operational requirements

Production deployment requires HTTPS, secure cookies, explicit CORS origins, trusted proxy configuration, distributed rate limiting for multi-process service, database backups, secret rotation, dependency monitoring, and verified storage cleanup. The optional Terraform configuration is a starting point and requires an owner security review before production use.
