const { createLocationSession, checkProduct } = require('./bigbasket');

const MAX_PRODUCTS = 30;
const MAX_LOCATIONS = 10;
function reply(res, status, body) { return res.status(status).json(body); }
function validProduct(value) { return /^\d{3,20}$/.test(String(value || '')); }
function validLocation(item) { return item && /^\d{6}$/.test(String(item.pincode || '')) && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)); }

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() { while (true) { const index = cursor++; if (index >= items.length) return; output[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length:Math.min(limit, items.length) }, run));
  return output;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return reply(res, 405, { error:'Use POST.' });
  const products = [...new Set(Array.isArray(req.body?.products) ? req.body.products.map(String).filter(validProduct) : [])].slice(0, MAX_PRODUCTS);
  const locations = Array.isArray(req.body?.locations) ? req.body.locations.filter(validLocation).slice(0, MAX_LOCATIONS) : [];
  if (!products.length) return reply(res, 400, { error:'Send at least one numeric BigBasket product ID.' });
  if (!locations.length) return reply(res, 400, { error:'Select at least one BigBasket delivery location.' });
  try {
    const results = await mapLimit(locations, 3, async location => {
      const label = location.area || location.address || `${location.pincode}`;
      try {
        const jar = await createLocationSession(location);
        const rows = await mapLimit(products, 4, async productId => {
          try { return { ...await checkProduct(productId, location, jar), pincode:String(location.pincode), locationLabel:label }; }
          catch (error) { return { productId, name:`Product ${productId}`, available:false, pincode:String(location.pincode), locationLabel:label, error:error.message || 'Product check failed.' }; }
        });
        return rows;
      } catch (error) {
        return products.map(productId => ({ productId, name:`Product ${productId}`, available:false, pincode:String(location.pincode), locationLabel:label, error:error.message || 'Location check failed.' }));
      }
    });
    return reply(res, 200, { checkedAt:new Date().toISOString(), results:results.flat() });
  } catch (error) { return reply(res, 502, { error:error.message || 'BigBasket stock service unavailable.' }); }
};
