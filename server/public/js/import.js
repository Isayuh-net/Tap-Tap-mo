// Import students page: reads a CSV file, shows the server's preview, then imports on confirm.
const $ = (id) => document.getElementById(id);
const message = $('message');
let csvText = null;
let lastResult = null;

const STATUS_TEXT = { new: 'Will be added', imported: 'Added', duplicate: 'Already added', error: 'Has problems' };
const FIELD_NAMES = {
  lrn: 'LRN', schoolId: 'School ID', sex: 'Sex', fullName: 'Name', firstName: 'First name', middleName: 'Middle name', lastName: 'Last name',
  gradeLevel: 'Grade', strand: 'Strand', section: 'Section', guardianName: 'Parent', guardianMobile: 'Mobile',
};

// Excel's "CSV UTF-8" is UTF-8; its plain "CSV" on Windows is Windows-1252 (where ñ is a single byte).
async function readCsvFile(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// An Excel file is sent as base64 text; the server turns it into CSV.
async function readBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

$('file').addEventListener('change', async () => {
  const file = $('file').files[0];
  csvText = null;
  $('preview').hidden = true;
  showMessage(message, '', '');
  if (!file) return;
  if (/\.xls$/i.test(file.name)) {
    showMessage(message, 'error', 'This is an old Excel file (.xls). In Excel choose File > Save As > Excel Workbook (.xlsx) or CSV UTF-8, then choose that file here.');
    return;
  }
  try {
    csvText = /\.xlsx$/i.test(file.name)
      ? (await api('/students/import/convert', { method: 'POST', body: { xlsx: await readBase64(file) } })).csv
      : await readCsvFile(file);
    showResult(await api('/students/import', { method: 'POST', body: { csv: csvText, commit: false } }));
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
});

$('import').addEventListener('click', async () => {
  $('import').disabled = true;
  try {
    const result = await api('/students/import', { method: 'POST', body: { csv: csvText, commit: true } });
    showResult(result);
    showMessage(message, 'ok', `Added ${result.summary.imported} students. Next, open Assign cards to give them their cards.`);
  } catch (err) {
    showMessage(message, 'error', err.message);
    $('import').disabled = false;
  }
});

$('problems-only').addEventListener('change', () => lastResult && renderRows(lastResult.rows));

function showResult(result) {
  lastResult = result;
  $('preview').hidden = false;

  $('columns').textContent = 'Columns found: ' + Object.entries(result.columns)
    .map(([field, header]) => `${FIELD_NAMES[field]} = "${header}"`).join(', ');

  const { summary } = result;
  const chips = [
    ['new', summary.new, 'will be added'],
    ['imported', summary.imported, 'added'],
    ['duplicate', summary.duplicate, 'already in the system'],
    ['error', summary.error, 'have problems (skipped)'],
  ].filter(([, n]) => n > 0);
  $('summary').replaceChildren(...chips.map(([status, n, text]) => {
    const chip = document.createElement('span');
    chip.className = `badge ${status}`;
    chip.textContent = `${n} ${text}`;
    return chip;
  }));

  $('import').textContent = `Import ${summary.new} new students`;
  $('import').disabled = summary.new === 0;
  renderRows(result.rows);
}

function renderRows(rows) {
  const onlyProblems = $('problems-only').checked;
  const shown = onlyProblems ? rows.filter((r) => r.status === 'error' || r.warnings.length) : rows;
  $('rows').replaceChildren(...shown.map((r) => {
    const tr = document.createElement('tr');
    const cells = [r.row, r.fullName, r.sex ?? '', r.classLabel, r.lrn ?? '', r.schoolId ?? '', r.guardianName ?? '', r.guardianMobile ?? ''];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${r.status}`;
    badge.textContent = STATUS_TEXT[r.status];
    status.append(badge);
    for (const [kind, notes] of [['problem', r.problems], ['warning', r.warnings]]) {
      for (const note of notes) {
        const div = document.createElement('div');
        div.className = `note ${kind}`;
        div.textContent = note;
        status.append(div);
      }
    }
    tr.append(status);
    return tr;
  }));
}
