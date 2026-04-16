export function requireProvider(req, res, next) {
  const user = req.user;
  if (!user || user.role !== 'PROVIDER') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!user.apiSystemId) {
    return res.status(403).json({ error: 'Cuenta mal configurada, contacte admin' });
  }
  req.apiSystemId = user.apiSystemId;
  return next();
}
