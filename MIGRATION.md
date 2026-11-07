# ConTracker backend: salvaging server.js into MVC

Rule for every step: move code, do not change what it does. Fixes come later, one at a time.
`original/server.js` is the untouched 1,195-line file (read-only). Line numbers below refer to it.

## How it runs while we migrate

`src/legacy/legacy.routes.js` holds everything that has not been moved yet, line for line.
Each step moves a slice out of it into its proper folder. When it is empty, it is deleted.
The app starts and behaves like the original after every step.

## Step 1 (done): foundations

| New file | Came from original | Note |
|---|---|---|
| `server.js` | 646, 1186-1195 | boot only: http server, websocket attach, schema, listen, file cleanup timers |
| `src/app.js` | 64-67, 1180 | helmet, cors, json body, routes, error handler (same order) |
| `src/config/env.js` | 40-51 | PORT, JWT_SECRET, DATABASE_URL and the exit-if-missing checks |
| `src/config/db.js` | 53-62 | pool and initSchema; schema.sql is now looked up at the project root |
| `src/models/kv.model.js` | 88-99 | kvGet / kvSet, the only code that touches kv_store |
| `src/utils/compare.js` | 101-119, 371-388 | deepEqual, isBlankVal, looseEqual |
| `src/realtime/hub.js` | 645-668 | websocket server attach + broadcastChanged |
| `src/middleware/errorHandler.js` | 1180-1184 | last-resort error handler |
| `src/legacy/legacy.routes.js` | everything else | `app.get/post/put` became `router.get/post/put` |

Checked by running the original and this version side by side on the same requests (50 checks: login,
roles, scoped reads, container writes and conflicts, registration, password reset, file upload and
download, 25 MB limit, malformed JSON, WebSocket push). Responses were identical.

## Next steps, in order

2. Auth: `signToken`, `authOptional`, `authRequired`, `isSctl`, `isTerminalAdmin`, `profileOf`, the five `/api/auth/*` routes
3. Constants: roles, departments, stage rules, field labels
4. Policies: visibility and write-permission functions (user, terminal, container, document, message, referral, log)
5. Collections one at a time through `/api/storage/:key`: users, terminals, containers, then activity-log, referrals, messages (service per collection, views for redaction)
6. Files and documents: `/api/files`, `checkDocumentChanges`, `cleanupOrphanFiles`
7. Bootstrap/demo routes, then `legacy.routes.js` is deleted

## Still needed from you

- `schema.sql` (the tables `kv_store`, `credentials` and `files`). The server will not start without it at the project root.
- Your `package.json`, so dependency versions match what you run today. Express is pinned to 4.x here.

## Noticed, not fixed (original line numbers)

Two of these were reproduced against the original code on a scratch database.

1. **Any signed-in user can make themselves SCTL (confirmed).** A user may edit their own record in
   `users` (`checkUsersWrite`, 349-355), including `role`, and the next login signs a token from the
   stored role (960-963). An importer who saved `role: "sctl"` got an SCTL token on next login.
2. **A pending self-registered account can sign in as a terminal Admin (confirmed).** Registration
   takes `role` and `department` from the request (891, 929) and login never checks `status`
   (949-965). Registering as role `admin`, department `Admin` at any active terminal gave an
   Admin token for that terminal while still pending.
3. A terminal Admin may set any role, including `sctl`, on accounts at their own terminal (335-346).
4. Credentials-only register (882-888) is public and accepts any `id`, so it can attach a password to
   a user id that has none yet.
5. Role, department and terminal live in the token for 12 hours and are not re-read from the database
   (70-84), so a suspended or demoted account keeps its access until the token expires.
   `set-password` does not invalidate old tokens either.
6. Any signed-in user can PUT any other storage key (1171-1173), creating arbitrary rows.
7. `PUT /api/storage/:key` reads, checks and writes without a lock or transaction (1089-1178), so two
   saves at the same moment can overwrite each other; the `_v` check is not atomic.
8. Async route handlers have no try/catch. On Express 4 a database error inside one becomes an
   unhandled rejection that can stop the process.
9. No rate limiting on login or registration; passwords only need 6 characters; JSON bodies up to 25 MB
   are accepted on unauthenticated routes.
10. `bootstrap-demo-data` is open to anyone while the `users` collection does not exist (1045-1062).
11. WebSocket token is passed in the URL (650-661), sockets are never re-checked after connecting, and
    every socket is told about every change, whatever its role or terminal. The message carries only
    the collection name, not data.
12. Scale: each collection is one JSON row that is read and rewritten whole on every request, and
    `withDuplicateFlags` and file downloads scan whole collections. This is the main limit for
    expanding, and the reason to move to real tables later.
