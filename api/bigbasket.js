const crypto = require('crypto');

const ORIGIN = 'https://www.bigbasket.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
// BigBasket's product HTML is Akamai-blocked for server requests; its Next data route works.
const PRODUCT_BUILD_ID = '3hmgDigltut4DE23S9zo2';

class CookieJar {
  constructor() { this.values = new Map(); }
  set(key, value) { if (key && value !== undefined && value !== null) this.values.set(key, String(value)); }
  get(key) { return this.values.get(key) || ''; }
  add(response) {
    const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : splitSetCookie(response.headers.get('set-cookie') || '');
    values.forEach(value => { const pair = value.split(';', 1)[0]; const index = pair.indexOf('='); if (index > 0) this.values.set(pair.slice(0, index), pair.slice(index + 1)); });
  }
  header() { return [...this.values].map(([key, value]) => `${key}=${value}`).join('; '); }
}

function splitSetCookie(value) { return value.split(/,(?=\s*[^;,=]+=[^;,]*)/g).map(item => item.trim()).filter(Boolean); }
function tracker() { return crypto.randomUUID(); }
function url(path) { return path.startsWith('http') ? path : `${ORIGIN}${path}`; }
function headers(jar, extra = {}) {
  const base = { Accept:'application/json, text/plain, */*', 'User-Agent':USER_AGENT, Origin:ORIGIN, Referer:`${ORIGIN}/`, 'X-Channel':'BB-WEB', 'X-Caller':'Monster-SVC', 'X-Entry-Context':'bbnow', 'X-Entry-Context-Id':'10', 'X-CSRFToken':jar?.get('csrftoken') || '', 'X-csurftoken':jar?.get('csurftoken') || '', 'X-Integrated-FC-Door-Visible':'false', 'X-Tracker':tracker(), 'X-Timestamp':String(Math.floor(Date.now() / 1000)), 'common-client-static-version':'101' };
  if (jar?.header()) base.Cookie = jar.header();
  return { ...base, ...extra };
}

async function request(path, options = {}, jar = null) {
  const response = await fetch(url(path), { redirect:'follow', ...options, headers:headers(jar, options.headers || {}) });
  jar?.add(response);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, text, body };
}

function productDataFromDetails(details, productId) {
  const children = details?.children || [];
  const item = children.find(child => String(child.id) === String(productId)) || children[0];
  if (!item) throw new Error(`Product ${productId} was not found.`);
  const availability = item.availability || {};
  const pricing = item.pricing?.discount || {};
  const name = [item.brand?.name, item.desc, item.pack_desc, item.w].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || `Product ${productId}`;
  const available = availability.avail_status === '001' || /^(add|add to basket)$/i.test(String(availability.button || ''));
  return { productId:String(productId), name, available, label:availability.label || (available ? 'Available' : 'Out of stock'), price:pricing.prim_price?.sp || pricing.mrp || '', eta:availability.short_eta || availability.medium_eta || availability.long_eta || '', image:item.images?.[0]?.m || '' };
}

async function createLocationSession(location) {
  const jar = new CookieJar();
  await request('/', { headers:{ Accept:'text/html,application/xhtml+xml' } }, jar).catch(() => null);
  const visitor = await request('/mapi/v3.5.2/create-visitor/?integratedglobalsa=false', { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:'city_id=1&z=&is_bot=false&send_global_address=1' }, jar).catch(() => null);
  const visitorCookies = visitor?.body?.response || visitor?.body || {};
  ['_bb_aid','_bb_cid','_bb_vid','_bb_nhid','_bb_dsid','_bb_dsevid','_bb_bhid','_bb_loid','csrftoken'].forEach(key => jar.set(key, visitorCookies[key]));
  jar.set('x-channel', 'web'); jar.set('jentrycontextid', '10'); jar.set('xentrycontextid', '10'); jar.set('xentrycontext', 'bbnow'); jar.set('isintegratedsa', 'true'); jar.set('bb2_enabled', 'true');
  const lat = Number(location.lat), lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Selected location has no valid coordinates.');
  const serviceable = await request(`/ui-svc/v1/serviceable/?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&send_all_serviceability=true`, {}, jar);
  if (!serviceable.response.ok) throw new Error(`Location serviceability failed (${serviceable.response.status}).`);
  const update = await request('/member-svc/v2/member/current-delivery-address/', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ lat, long:lng, return_hub_cookies:false, area:null, contact_zipcode:String(location.pincode) }) }, jar);
  if (!update.response.ok) throw new Error(`BigBasket location update failed (${update.response.status}).`);
  await request(`/ui-svc/v2/header/?send_door_info=true&send_address_set_by_user=true&i=${Date.now()}`, {}, jar);
  return jar;
}

async function checkProduct(productId, location, jar) {
  const params = encodeURIComponent(productId);
  const first = await request(`/_next/data/${PRODUCT_BUILD_ID}/pd/${params}.json?params=${params}`, { headers:{ Accept:'application/json' } }, jar);
  if (!first.response.ok) throw new Error(`Product data failed (${first.response.status}).`);
  const redirect = first.body?.pageProps?.__N_REDIRECT;
  if (!redirect) return productDataFromDetails(first.body?.pageProps?.productDetails, productId);
  const parts = redirect.split('?')[0].split('/').filter(Boolean);
  const routeParams = parts.slice(1).map(encodeURIComponent).map(value => `params=${value}`).join('&');
  const route = `/_next/data/${PRODUCT_BUILD_ID}/${parts.map(encodeURIComponent).join('/')}.json?${routeParams}`;
  const page = await request(route, { headers:{ Accept:'application/json' } }, jar);
  if (!page.response.ok) throw new Error(`Product data failed (${page.response.status}).`);
  return productDataFromDetails(page.body?.pageProps?.productDetails, productId);
}

module.exports = { ORIGIN, USER_AGENT, request, tracker, createLocationSession, checkProduct };

