const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const dir = "C:\\Users\\Nikit\\Desktop\\my-admin-panel";
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));

files.forEach(f => {
  try {
    const fp = path.join(dir, f);
    const wb = XLSX.readFile(fp);
    const sheets = wb.SheetNames;
    console.log('=== ' + f + ' ===');
    console.log('Sheets:', sheets.join(', '));
    sheets.forEach(s => {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: '', header: 1 });
      console.log('  Sheet "' + s + '": ' + data.length + ' rows');
      if (data.length > 0) {
        console.log('  Columns:', data[0].join(' | '));
        if (data.length > 1) {
          console.log('  Row 1:', JSON.stringify(data[1]).substring(0, 300));
        }
        if (data.length > 2) {
          console.log('  Row 2:', JSON.stringify(data[2]).substring(0, 300));
        }
      }
    });
    console.log('');
  } catch(e) {
    console.log('Error reading ' + f + ': ' + e.message);
  }
});
