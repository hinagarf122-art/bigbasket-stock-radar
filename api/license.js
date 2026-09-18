const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LICENSE_FILE = path.join(__dirname, '..', 'licenses.json');

function licenses() {
  try {
    const value = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
    const items = Array.isArray(value) ? value : value?.licenses;
    return Array.isArray(items) ? items.map(item => typeof item === 'string' ? item : item?.id || item?.license).map(item => String(item || '').trim().toUpperCase()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function matches(candidate, stored) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(stored);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function reply(res, status, body) { return res.status(status).json(body); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return reply(res, 405, { error: 'Use POST.' });
  const candidate = String(req.body?.license || '').trim().toUpperCase();
  const valid = candidate.length > 0 && licenses().some(item => matches(candidate, item));
  if (!valid) return reply(res, 403, { valid: false, error: 'Invalid license ID.' });
  return reply(res, 200, { valid: true, checkedAt: new Date().toISOString() });
};
