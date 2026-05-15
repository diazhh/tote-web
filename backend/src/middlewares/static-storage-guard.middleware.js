/**
 * P-1 (BLOCKING for F-14): backend/storage is publicly served by express.static
 * in backend/src/index.js. Receipts at storage/receipts/ MUST NOT be reachable
 * without auth.
 *
 * This guard is mounted on `/storage` BEFORE the express.static handler so
 * direct hits like `GET /storage/receipts/2026/05/<uuid>.pdf` short-circuit
 * with 401 before the static file middleware can stream the file.
 *
 * Mount order is load-bearing — see backend/src/index.js (the line
 * `app.use('/storage', staticStorageGuard)` MUST appear immediately above the
 * existing `app.use('/storage', express.static(...))` call).
 *
 * Non-receipts traffic (e.g. /storage/games/1/foo.png) is unaffected: this
 * middleware calls next() for any path that does not target /receipts/.
 *
 * Auth-gated downloads of the same receipt file still work because they go
 * through `GET /api/contabilidad/asientos/:id/attachments/:attId` which never
 * touches the /storage/* path — see attachment.controller.js#download.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function staticStorageGuard(req, res, next) {
  if (req.path.startsWith('/receipts/') || req.path === '/receipts') {
    return res.status(401).json({ error: 'Forbidden' });
  }
  next();
}
