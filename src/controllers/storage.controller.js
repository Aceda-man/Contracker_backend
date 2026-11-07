const storageService = require('../services/storage.service');
const { authOptional } = require('../middleware/auth');
const { isSctl } = require('../policies/role.policy');
const { checkTerminalsWrite } = require('../policies/terminal.policy');
const { kvGet, kvSet } = require('../models/kv.model');
const { broadcastChanged } = require('../realtime/hub');
const { checkUsersWrite } = require('../policies/user.policy');
const { userVisibleTo } = require('../policies/visibility.policy');
const { redactUserFor } = require('../views/user.view');
const { wantsReplace, restoreUndeleted, changedIdSet, applyChangedOnly, findStale, conflictMessage, validList } = require('../services/merge.helpers');
const { mergeUsers } = require('../services/userMerge.service');
const { checkContainersWrite } = require('../policies/container.policy');
const { checkDocumentChanges } = require('../policies/document.policy');
const { containersViewFor } = require('../services/containerView.service');
const { mergeContainers } = require('../services/containerMerge.service');

// GET /api/storage/:key — same order of checks as the original handler.
const readKey = async (req, res) => {
  const key = req.params.key;
  if (!storageService.PUBLIC_READ_KEYS.has(key) && !authOptional(req)) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  if (storageService.SCOPED_KEYS.includes(key)) {
    const user = authOptional(req);   // 'users' and 'terminals' have legitimate unauthenticated self-registration cases, checked below
    if (!user) return res.status(401).json({ error: 'Sign in required.' });
    return res.json({ value: await storageService.readScoped(key, user) });
  }
  if (key === 'containers') {
    return res.json({ value: await storageService.readContainers(authOptional(req)) });
  }
  res.json({ value: await storageService.readValue(key) });
};

// PUT /api/storage/:key for 'terminals' and 'platform-settings' and users only. Every other key is passed on (next)
// to the old handler in legacy.routes.js until its own piece is moved. Same order of checks as the original.
const MOVED_WRITE_KEYS = new Set(['users', 'containers', 'terminals', 'platform-settings']);

const writeKey = async (req, res, next) => {
  const key = req.params.key;
  if (!MOVED_WRITE_KEYS.has(key)) return next();
  const raw = req.body && req.body.value;
  if (typeof raw !== 'string') return res.status(400).json({ error: 'Body must be { value: "<json string>" }.' });
  let parsed;
  const versions = {};
  try { parsed = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'value must be valid JSON.' }); }

  const user = authOptional(req); // 'terminals' has a legitimate unauthenticated self-registration case, checked in the policy

  if (key === 'users') {
    const old = (await kvGet('users')) || [];
    if (!user) {
      const err = checkUsersWrite(old, parsed, user);
      if (err) return res.status(401).json({ error: err });
    } else {
      if (!validList(parsed)) return res.status(400).json({ error: 'Malformed user list.' });
      const view = old.filter(u => userVisibleTo(user, u)).map(u => redactUserFor(user, u));
      const visible = new Set(view.map(u => u.id)), oldIds = new Set(old.map(u => u.id));
      if (parsed.some(u => oldIds.has(u.id) && !visible.has(u.id))) return res.status(403).json({ error: 'One of those accounts belongs to a record you do not have access to.' });
      if (!wantsReplace(req.body, user)) {
        const changed = changedIdSet(req.body, parsed);
        parsed = applyChangedOnly(view, parsed, changed);
        const stale = findStale(view, parsed, changed);
        if (stale) return res.status(409).json({ error: conflictMessage('The account for ' + (stale.name || 'that person')), conflict: true });
      }
      parsed = restoreUndeleted(view, parsed, req.body, user);
      const mineIds = new Set(parsed.map(x => x.id));
      const err = checkUsersWrite(view, parsed, user);
      if (err) return res.status(403).json({ error: err });
      parsed = mergeUsers(old, view, parsed, user);
      for (const x of parsed) if (mineIds.has(x.id)) versions[x.id] = x._v;
    }
    } else if (key === 'containers') {
    if (!user) return res.status(401).json({ error: 'Sign in required.' });
    if (!Array.isArray(parsed) || parsed.some(c => !c || typeof c !== 'object' || typeof c.id !== 'string')) {
      return res.status(400).json({ error: 'Malformed container list.' });
    }
    const full = (await kvGet('containers')) || [];
    const { profile, view: oldView } = await containersViewFor(user, full);
    const visibleIds = new Set(oldView.map(c => c.id));
    const fullIds = new Set(full.map(c => c.id));
    if (parsed.some(c => fullIds.has(c.id) && !visibleIds.has(c.id))) {
      return res.status(403).json({ error: 'One of those jobs belongs to a record you do not have access to.' });
    }
    const replaceAll = wantsReplace(req.body, user);
    if (!replaceAll) {
      const changed = changedIdSet(req.body, parsed);
      parsed = applyChangedOnly(oldView, parsed, changed);
      const stale = findStale(oldView, parsed, changed);
      if (stale) return res.status(409).json({ error: conflictMessage('Job ' + stale.containerNumber), conflict: true });
      parsed = restoreUndeleted(oldView, parsed, req.body, user);
    }
    const mineIds = new Set(parsed.map(x => x.id));
    const err = replaceAll ? null : await checkContainersWrite(oldView, parsed, user, profile);
    if (err) return res.status(403).json({ error: err });
    if (!replaceAll) {
      const derr = await checkDocumentChanges(oldView, parsed, user, profile);
      if (derr) return res.status(403).json({ error: derr });
    }
    parsed = mergeContainers(full, oldView, parsed, user);
    for (const x of parsed) if (mineIds.has(x.id)) versions[x.id] = x._v;
  } else if (key === 'terminals') {
    const old = (await kvGet('terminals')) || [];
    const err = checkTerminalsWrite(old, parsed, user);
    if (err) return res.status(user ? 403 : 401).json({ error: err });
  } else {
    if (!user) return res.status(401).json({ error: 'Sign in required.' });
    if (!isSctl(user)) return res.status(403).json({ error: 'Only SCTL can change platform settings.' });
  }

  await kvSet(key, parsed);
  broadcastChanged(key);
  res.json({ ok: true, versions });
};

module.exports = { readKey, writeKey };