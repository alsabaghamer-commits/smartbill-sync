import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import getRawBody from 'raw-body';
import fs from 'fs';
import cron from 'node-cron';
import * as SB from './services/smartbill.js';
import * as SH from './services/shopify.js';

dotenv.config();
const app = express();
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static('public'));

const SETTINGS_PATH = './data/settings.json';
function readSettings(){ try{ return JSON.parse(fs.readFileSync(SETTINGS_PATH,'utf-8')); }catch{ return {}; } }
function writeSettings(s){ fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s,null,2)); }

app.get('/health',(req,res)=>res.json({ok:true}));
app.get('/admin/settings',(req,res)=>res.sendFile(process.cwd() + '/public/settings.html'));

// SmartBill meta (serii & gestiuni)
app.get('/api/sb/meta', async (req,res)=>{
  try{
    const [series, warehouses] = await Promise.all([SB.fetchSeries(), SB.fetchWarehouses()]);
    res.json({ series, warehouses });
  }catch(e){ res.status(500).json({ error: e.response?.data || e.message }); }
});

// Salvează setări & mapare
app.post('/api/settings',(req,res)=>{ const next={...readSettings(),...req.body}; writeSettings(next); res.json({ok:true, settings: next}); });
app.post('/api/map',(req,res)=>{ const cur=readSettings(); cur.warehouseMap = req.body || {}; writeSettings(cur); res.json({ok:true}); });

// Emitere factură/proformă manual
app.post('/actions/document', async (req,res)=>{
  try{
    const { orderRef, type='invoice', warehouse } = req.body || {};
    if(!orderRef) return res.status(400).json({error:'Lipsește numărul/ID-ul comenzii'});
    const order = await SH.fetchOrderByRef(orderRef);
    if(!order) return res.status(404).json({error:'Comandă negăsită în Shopify'});

    const s=readSettings();
    const w = warehouse || s.defaultWarehouse || process.env.SMARTBILL_DEFAULT_WAREHOUSE;
    const series = s.defaultSeries || process.env.SMARTBILL_SERIE || 'SB';
    const result = await SB.createDocFromOrder({ order, type, warehouse:w, series, sendEmail: s.autoSendPdf ?? true });
    res.json({ docType:type, ...result });
  }catch(e){ res.status(500).json({error: e.response?.data || e.message}); }
});

// Notă de credit manual
app.post('/actions/credit', async (req,res)=>{
  try{
    const { orderRef, reason='Return' } = req.body || {};
    if(!orderRef) return res.status(400).json({error:'Lipsește numărul/ID-ul comenzii'});
    const order = await SH.fetchOrderByRef(orderRef);
    if(!order) return res.status(404).json({error:'Comandă negăsită în Shopify'});

    const s=readSettings();
    const w = s.defaultWarehouse || process.env.SMARTBILL_DEFAULT_WAREHOUSE;
    const series = s.defaultSeries || process.env.SMARTBILL_SERIE || 'SB';
    const result = await SB.createCreditFromOrder({ order, warehouse:w, series, reason });
    res.json(result);
  }catch(e){ res.status(500).json({error: e.response?.data || e.message}); }
});

// Webhook Shopify (orders/paid, refunds/create)
app.post('/webhooks/shopify', async (req,res)=>{
  try{
    const raw=await getRawBody(req);
    const hmacHeader = req.headers['x-shopify-hmac-sha256'] || '';
    const crypto = await import('crypto');
    const digest = crypto.createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET).update(raw).digest('base64');
    if(!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))) return res.status(401).send('Invalid HMAC');

    const topic=req.headers['x-shopify-topic'];
    const payload=JSON.parse(raw.toString('utf-8'));
    const s=readSettings();

    if(topic==='orders/paid' && (s.autoInvoice || String(process.env.AUTO_INVOICE).toLowerCase()==='true')){
      const series = s.defaultSeries || process.env.SMARTBILL_SERIE || 'SB';
      const warehouse = s.defaultWarehouse || process.env.SMARTBILL_DEFAULT_WAREHOUSE;
      await SB.createDocFromOrder({ order:payload, type:'invoice', series, warehouse, sendEmail: s.autoSendPdf ?? true });
    }
    if(topic==='refunds/create' && (s.autoCreditNote || String(process.env.AUTO_CREDITNOTE).toLowerCase()==='true')){
      const series = s.defaultSeries || process.env.SMARTBILL_SERIE || 'SB';
      const warehouse = s.defaultWarehouse || process.env.SMARTBILL_DEFAULT_WAREHOUSE;
      await SB.createCreditFromOrder({ order:payload, series, warehouse, reason:'Refund Shopify' });
    }
    res.send('ok');
  }catch(e){ res.status(500).send('error'); }
});

// Cron sincron stocuri (SmartBill -> Shopify)
cron.schedule(process.env.CRON_STOCK_EXPR || '*/1 * * * *', async ()=>{
  try{
    console.log('[cron] stock sync start');
    const variants = await SH.listRecentVariantSKUs(250);
    const skus = variants.map(v=>v.sku).filter(Boolean);
    if(!skus.length){ console.log('[cron] no SKUs'); return; }
    const stocks = await SB.fetchStocksBySKUs(skus);
    const locationId = await SH.getLocationId();
    for(const [sku,qty] of Object.entries(stocks)){
      const invId = await SH.getInventoryItemIdBySKU(sku);
      if(invId){ await SH.updateInventoryLevel(invId, locationId, qty); console.log(`[stock] ${sku} -> ${qty}`); }
    }
    console.log('[cron] stock sync done');
  }catch(e){ console.error('[cron] stock sync failed', e.response?.data || e.message); }
});

const port = process.env.PORT || 10000;
app.listen(port, ()=> console.log('Listening on :' + port));
