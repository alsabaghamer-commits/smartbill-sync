import axios from 'axios';

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_API_VERSION = '2024-10',
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_LOCATION_ID
} = process.env;

const api = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN, 'Content-Type':'application/json' },
  timeout: 20000
});

export async function fetchOrderByRef(ref){
  if(String(ref).startsWith('#')){
    const { data } = await api.get('/orders.json', { params:{ name: ref, status:'any', limit:1 } });
    return data.orders?.[0] || null;
  }
  const id = String(ref).replace(/\D/g,'');
  const { data } = await api.get(`/orders/${id}.json`);
  return data.order || null;
}

export async function getLocationId(){
  if (SHOPIFY_LOCATION_ID && SHOPIFY_LOCATION_ID !== '########') return SHOPIFY_LOCATION_ID;
  const { data } = await api.get('/locations.json');
  return data.locations?.[0]?.id;
}

export async function getInventoryItemIdBySKU(sku){
  const { data } = await api.get('/variants.json', { params:{ sku, limit:1 } });
  const v = data.variants?.[0];
  return v ? v.inventory_item_id : null;
}

export async function updateInventoryLevel(inventoryItemId, locationId, available){
  const payload = { location_id:Number(locationId), inventory_item_id:Number(inventoryItemId), available:Number(available) };
  const { data } = await api.post('/inventory_levels/set.json', payload);
  return data;
}

export async function listRecentVariantSKUs(limit=250){
  const { data } = await api.get('/variants.json', { params:{ limit } });
  return (data.variants||[]).map(v=>({ id:v.id, sku:v.sku, inventory_item_id:v.inventory_item_id }));
}
