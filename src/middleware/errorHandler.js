// Moved verbatim from the original server.js (lines 1180-1184): the last-resort error handler.
// app.js mounts it after all routes, exactly where the original registered it.

module.exports = (err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too large to upload (files can be up to 10 MB).' });
  console.error(err);
  res.status(err && err.status ? err.status : 500).json({ error: 'Something went wrong on the server. Please try again.' });
};
