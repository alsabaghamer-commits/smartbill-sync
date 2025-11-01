# SmartBill Sync for Shopify (module-like)
- Emitere manuală: factură / proformă (+ opțional automat la paid)
- Notă de credit (manuală sau automat la refund)
- Detecție serii & gestiuni (pagina Setări)
- Mapare gestiuni SmartBill → Shopify Locations
- Sincron stocuri SmartBill → Shopify (*/1 min)

## Render
Build: —
Start: node server.js
Env vars: vezi .env.example

## Shopify
Develop apps → SmartBill Sync → scopes (orders/products/inventory read+write, customers read) → App URL = URL Render → Install.

## Important
SKU Shopify = cod produs SmartBill.
