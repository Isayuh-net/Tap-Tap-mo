// Writes rows as a CSV file that Excel opens correctly: UTF-8 with a BOM (so ñ shows) and CRLF lines.
// columns: [{ header, value: (row) => cellValue, text: true }]. text: true keeps long numbers
// like LRNs from turning into "1.23457E+11" in Excel.
function toCsv(columns, rows) {
  const escape = (value, asText) => {
    let cell = value === null || value === undefined ? '' : String(value);
    if (asText && /^\d+$/.test(cell)) return `="${cell}"`;
    // Cells starting with = + - @ could run as formulas in Excel, so they get a leading '
    if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
    return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  };
  const lines = [
    columns.map((c) => escape(c.header)),
    ...rows.map((row) => columns.map((c) => escape(c.value(row), c.text))),
  ];
  return `﻿${lines.map((line) => line.join(',')).join('\r\n')}\r\n`;
}

module.exports = { toCsv };
