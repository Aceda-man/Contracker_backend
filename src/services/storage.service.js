const { kvGet } = require('../models/kv.model');
const { scopedView } = require('./scope.service');
const { containersViewFor } = require('./containerView.service');

// 'platform-settings' and 'terminals' are readable without signing in: the login screen needs
// branding, and the registration form needs the list of bonded terminals before anyone has a session.
const PUBLIC_READ_KEYS = new Set(['platform-settings', 'terminals']);
const SCOPED_KEYS = ['users', 'activity-log', 'referrals', 'messages'];

async function readValue(key) {
  const value = await kvGet(key);
  return value === null ? null : JSON.stringify(value);
}

async function readScoped(key, user) {
  const full = (await kvGet(key)) || [];
  return JSON.stringify(await scopedView(key, user, full));
}

async function readContainers(user) {
  const full = (await kvGet('containers')) || [];
  const { view } = await containersViewFor(user, full);
  return JSON.stringify(view);
}

module.exports = { PUBLIC_READ_KEYS, SCOPED_KEYS, readValue, readScoped, readContainers };