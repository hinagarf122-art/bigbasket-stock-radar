const { request, tracker } = require('./bigbasket');

function reply(res, status, body) { return res.status(status).json(body); }
function commonHeaders() { return { 'X-Tracker':tracker(), 'Content-Type':'application/json' }; }

async function autocomplete(query) {
  const token = tracker();
  const result = await request(`/places/v1/places/autocomplete/?inputText=${encodeURIComponent(query)}&token=${token}`, { headers:commonHeaders() });
  if (!result.response.ok) throw new Error(`BigBasket location search failed (${result.response.status}).`);
  const predictions = Array.isArray(result.body?.predictions) ? result.body.predictions : [];
  return predictions.map(item => ({ placeId:String(item.placeId || ''), description:item.description || '', mainText:item.mainText || '', secondaryText:item.secondaryText || '' })).filter(item => item.placeId);
}

async function resolve(placeId) {
  const token = tracker();
  const details = await request(`/places/v1/places/details/?placeId=${encodeURIComponent(placeId)}&token=${token}&xArm=0&yArm=0`, { headers:{ ...commonHeaders(), xArmour:'0', yArmour:'0', 'X-Tracker':`bwb-${tracker()}` } });
  if (!details.response.ok) throw new Error(`BigBasket location details failed (${details.response.status}).`);
  const geometry = details.body?.geometry?.location;
  if (!geometry) throw new Error('BigBasket did not return coordinates for this area.');
  const components = Array.isArray(details.body?.addressComponents) ? details.body.addressComponents : [];
  const component = type => components.find(item => Array.isArray(item.types) && item.types.includes(type))?.longName || '';
  const pincode = component('POSTAL_CODE') || String(details.body?.formattedAddress || '').match(/\b\d{6}\b/)?.[0] || '';
  if (!/^\d{6}$/.test(pincode)) throw new Error('This suggestion has no valid six-digit pincode.');
  const service = await request(`/ui-svc/v1/serviceable/?lat=${encodeURIComponent(geometry.lat)}&lng=${encodeURIComponent(geometry.lng)}&send_all_serviceability=true`, { headers:commonHeaders() });
  if (!service.response.ok) throw new Error(`BigBasket serviceability failed (${service.response.status}).`);
  const places = service.body?.places_info || {};
  const serviceable = service.body?.serviceable_ecs_info?.['bb-b2c']?.serviceable !== 'NA';
  return { id:String(placeId), pincode, lat:Number(geometry.lat), lng:Number(geometry.lng), area:places.locDesc || component('LOCALITY') || details.body?.formattedAddress || '', city:places.city || component('LOCALITY') || '', state:component('ADMINISTRATIVE_AREA_LEVEL_1') || '', address:details.body?.formattedAddress || '', serviceable };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return reply(res, 405, { error:'Use GET.' });
  try {
    const placeId = String(req.query?.placeId || '').trim();
    if (placeId) return reply(res, 200, { location:await resolve(placeId) });
    const query = String(req.query?.query || '').trim();
    if (query.length < 3 || query.length > 80) return reply(res, 400, { error:'Enter at least three characters.' });
    return reply(res, 200, { predictions:await autocomplete(query) });
  } catch (error) { return reply(res, 502, { error:error.message || 'Location service unavailable.' }); }
};
