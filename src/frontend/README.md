# LectureBridge Frontend

Next.js client for the authenticated LectureBridge learning experience.

```powershell
npm ci
npm run dev
```

Quality gates:

```powershell
npm run lint
npm run typecheck
npm run build
```

Set `NEXT_PUBLIC_API_URL` for browser requests and `BACKEND_API_URL` for Next.js server routes when the backend is not available at the default local URL. Authentication uses the backend HttpOnly cookie; do not add token storage in browser persistence.
