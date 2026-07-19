const https = require('https');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdHBkd2p2cWFiaHlkb3hicXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTU0OTAsImV4cCI6MjA5OTk5MTQ5MH0.Y8Q0ohBfCdRquOOclPampF3L0Gd1j8opdfYYyxMYz_w';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdHBkd2p2cWFiaHlkb3hicXFnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDQxNTQ5MCwiZXhwIjoyMDk5OTkxNDkwfQ.U7zt3gcwlZhdOT_m8e6VorpFMlwiBV09xwh4dT6gLwc';

function api(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'vdtpdwjvqabhydoxbqqg.supabase.co',
      path: '/rest/v1/' + path,
      method: 'GET',
      headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body));
        else reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    const count = await api('orders?select=count:id&limit=1');
    console.log('Orders count API response:', JSON.stringify(count));

    const cols = await api('orders?select=trashed,deleted_at&limit=3');
    console.log('Sample columns:', JSON.stringify(cols));

    const templates = await api('templates?select=id,name&limit=5');
    console.log('Templates:', JSON.stringify(templates));

    const materials = await api('materials?select=id,name&limit=5');
    console.log('Materials:', JSON.stringify(materials));
  } catch(e) {
    console.log('Error:', e.message);
  }
}
main();
