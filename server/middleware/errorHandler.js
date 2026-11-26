export function errorHandler(err, _req, res, _next) {
  console.error('[server error]', err);
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'A record with that unique value already exists.' });
  }
  const status = err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  return res.status(status).json({ error: message });
}
