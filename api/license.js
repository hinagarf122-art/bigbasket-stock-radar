const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LICENSE_FILE = path.join(__dirname, '..', 'licenses.json');
const DEVICE_ID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|dev-[0-9a-f]+-[0-9a-f]+)$/i;

function licenses() {
  try {
    const value = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
    const items = Array.isArray(value) ? value : value?.licenses;
    return Array.isArray(items) ? items.map(item => typeof item === 'string' ? { id:item, deviceId:'' } : { id:item?.id || item?.license, deviceId:item?.deviceId || '' }).map(item => ({ id:String(item.id).trim().toUpperCase(), deviceId:String(item.deviceId).trim().toLowerCase() })).filter(item => item.id) : [];
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
  const deviceId = String(req.body?.deviceId || '').trim().toLowerCase();
  if (!DEVICE_ID_PATTERN.test(deviceId)) return reply(res, 400, { valid: false, error: 'Send a valid Device ID.' });
  const record = candidate.length > 0 ? licenses().find(item => matches(candidate, item.id)) : null;
  if (!record) return reply(res, 403, { valid: false, error: 'Invalid license ID.' });
  if (!record.deviceId) return reply(res, 403, { valid: false, error: 'This license is not assigned yet. Send your Device ID to the admin.' });
  if (!matches(deviceId, record.deviceId)) return reply(res, 403, { valid: false, error: 'This license is assigned to another device.' });
  return reply(res, 200, { valid: true, checkedAt: new Date().toISOString() });
};
