// Reads CSV text, as saved by Excel or Google Sheets, into rows of strings.
// Handles quoted fields (with commas, quotes or line breaks inside) and both comma and
// semicolon separators (some Excel language settings save with semicolons).
function parseCsv(text) {
  text = String(text).replace(/^﻿/, ''); // Excel's "CSV UTF-8" starts with a BOM
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const separator = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === separator) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

module.exports = { parseCsv };
