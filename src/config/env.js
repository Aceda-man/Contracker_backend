// Moved verbatim from the original server.js (lines 40-51): environment settings and the
// "refuse to start without them" checks.

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET) {
  console.error('JWT_SECRET is not set. Set it to a long random string before starting the server.');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Point it at your Postgres database before starting the server.');
  process.exit(1);
}

module.exports = { PORT, JWT_SECRET, DATABASE_URL };
