import axios from 'axios';
const { SMARTBILL_API_BASE='https://api.smartbill.ro', SMARTBILL_TOKEN, SMARTBILL_CIF, SMARTBILL_SERIE='SB', SMARTBILL_DEFAULT_WAREHOUSE='Magazin 2' } = process.env;
const api = axios.create({ baseURL: SMARTBILL_API_BASE, headers: { 'Authorization': `Bearer ${SMARTBILL_TOKEN}`, 'Content-Type':'application/json' }, timeout: 20000 });

export async function fetchSeries(){ const { data } = await api.get('/api/series', { params:{ companyVatCode: SMARTBILL_CIF }}); const list = data.items || data || []; return list.map(x=>x.name || x.seriesName).filter(Boolean); }
export async function fetchWarehouses(){ const { data } = await api.get('/api/warehouses', { params:{ companyVatCode: SMARTBILL_CIF }}); const list = data.items || data || []; return list.map(x=>x.name).filter(Boolean); }

export async function createDocFromOrder({ order, type='invoice', warehouse=SMARTBILL_DEFAULT_WAREHOUSE, series=SMARTBILL_SERIE, sendEmail=true }){
  const body = { companyVatCode: SMARTBILL_CIF, seriesName: series, issueDate: new Date().toISOString().slice(0,10), isDraft:false, sendEmail:!!sendEmail, warehouseName: warehouse, client: buildClient(order), products: buildProducts(order, warehouse), observations: `Shopify ${order.name || order.id} • ${type} • ${warehouse}` };
  const path = type === 'proforma' ? '/api/proforma' : '/api/invoice';
  const { data } = await api.post(path, body);
  return { number: data.number || data.numberString, pdfUrl: data.pdfUrl || null };
}
export async function createCreditFromOrder({ order, warehouse=SMARTBILL_DEFAULT_WAREHOUSE, series=SMARTBILL_SERIE, reason='Return' }){
  const body = { companyVatCode: SMARTBILL_CIF, seriesName: series, issueDate: new Date().toISOString().slice(0,10), warehouseName: warehouse, client: buildClient(order), products: buildProducts(order, warehouse).map(p=>({ ...p, quantity: -Math.abs(p.quantity) })), observations:`Shopify ${order.name || order.id} • credit • ${reason}` };
  const { data } = await api.post('/api/creditnote', body);
  return { number: data.number || data.numberString, pdfUrl: data.pdfUrl || null };
}
function buildClient(order){ const c = order.customer || {}; const s = order.shipping_address || {}; return { name: `${c.first_name || s.first_name || ''} ${c.last_name || s.last_name || ''}`.trim() || (c.email || 'Client Shopify'), email: c.email, isVATPayer:false, vatCode:null, address:[s.address1, s.address2].filter(Boolean).join(', '), city:s.city, county:s.province, country:s.country_code }; }
function buildProducts(order, warehouse){ return (order.line_items||[]).map(li=>({ name: li.title, code: li.sku || String(li.variant_id), measuringUnitName:'buc', currency: order.currency || 'RON', isDiscount:false, quantity: li.quantity, price: Number(li.price), vatRate: 19, warehouseName: warehouse })); }
export async function fetchStocksBySKUs(skus){ const { data } = await api.post('/api/stock', { companyVatCode: SMARTBILL_CIF, codes: skus }); const list = data.items || data || []; const out={}; list.forEach(it=> out[it.code]=Number(it.stock ?? 0)); return out; }
