// Moved verbatim from the original server.js (lines 101-119 and 371-388): plain-JSON comparison helpers.

// Order-independent deep-equal for plain JSON values — see Belburge's server.js
// for why a naive JSON.stringify comparison is not safe here.
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const aKeys = Object.keys(a), bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function isBlankVal(v) {
  return v === undefined || v === null || v === 0 || v === false || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isBlankVal));
}
// Equal once the app's own empty defaults are ignored. The app fills in empty
// values (null / 0 / false / [] and a 'pending' duty status) when it loads a
// job, so "missing" and "empty" must not count as someone editing the job.
function looseEqual(a, b, key) {
  if (deepEqual(a, b)) return true;
  if (isBlankVal(a) && isBlankVal(b)) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!looseEqual(a[k], b[k], k)) return false;
    return true;
  }
  if ((a === undefined || a === null) && key === 'dutyStatus' && b === 'pending') return true;
  return false;
}

module.exports = { deepEqual, isBlankVal, looseEqual };
