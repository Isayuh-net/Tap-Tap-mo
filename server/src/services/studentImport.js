// Imports many students at once from a CSV file (for example the school's enrollment list or the
// SF1 School Register, saved from Excel as CSV). Students are imported without cards; cards are
// linked afterwards on the Assign cards page. Parent numbers start unverified.
//
// importStudents(csvText, { commit }):
//  - commit false: only checks the file and returns every row with its status (a preview)
//  - commit true:  saves the rows marked 'new'
// Rows with problems and students already in the system are skipped, so the same file can be
// fixed and imported again safely.
const db = require('../db');
const { parseCsv } = require('../utils/csv');
const { classLabel } = require('../utils/classLabel');
const { httpError } = require('../utils/httpError');
const { checkFields } = require('./students');

const MAX_ROWS = 3000;
const HEADER_SEARCH_ROWS = 15; // the header may be below a title like "SCHOOL FORM 1"

// Column names we recognize (compared after normalizeHeader). Add your school's names here.
const COLUMN_NAMES = {
  lrn: ['lrn', 'learner reference number', 'learners reference number'],
  lastName: ['last name', 'surname', 'family name'],
  firstName: ['first name', 'given name'],
  middleName: ['middle name', 'middle initial', 'mi'],
  fullName: ['name', 'full name', 'student name', 'students name', 'learner name', 'learners name', 'complete name'],
  gradeLevel: ['grade', 'grade level', 'year level', 'grade/year level'],
  strand: ['strand', 'track/strand', 'track and strand', 'academic strand'],
  section: ['section'],
  guardianName: [
    'guardian', 'guardian name', 'guardians name', 'parent', 'parent name', 'parents name',
    'parent/guardian', 'parent/guardian name', 'parent/guardians name', 'name of parent/guardian', 'parent or guardian',
  ],
  guardianMobile: [
    'mobile', 'mobile number', 'mobile no', 'contact', 'contact number', 'contact no', 'cellphone',
    'cellphone number', 'cellphone no', 'cp', 'cp number', 'cp no', 'phone', 'phone number',
    'parent mobile', 'parent mobile number', 'guardian mobile', 'guardian mobile number',
    'parent contact', 'parent contact number', 'guardian contact', 'guardian contact number',
    'parent/guardian contact', 'parent/guardian contact number', 'parent/guardians contact number',
  ],
};

// "Contact No." -> "contact no", "Parent/Guardian's Name" -> "parent/guardians name"
function normalizeHeader(header) {
  return String(header).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9/]+/g, ' ').trim();
}

// Works out which column holds which field. Returns { field: columnIndex }.
function mapColumns(headerRow) {
  const headers = headerRow.map(normalizeHeader);
  const columns = {};
  const claim = (field, index) => {
    if (!(field in columns) && !Object.values(columns).includes(index)) columns[field] = index;
  };
  // 1. exact names
  headers.forEach((h, i) => {
    for (const [field, names] of Object.entries(COLUMN_NAMES)) if (names.includes(h)) claim(field, i);
  });
  // 2. names followed by more words, e.g. "Name (Last Name, First Name, Middle Name)"; longest name first
  const byLength = Object.entries(COLUMN_NAMES)
    .flatMap(([field, names]) => names.map((name) => [field, name]))
    .sort((a, b) => b[1].length - a[1].length);
  headers.forEach((h, i) => {
    const match = byLength.find(([, name]) => h.startsWith(`${name} `));
    if (match) claim(match[0], i);
  });
  // 3. any column mentioning a phone number
  headers.forEach((h, i) => {
    if (/\b(contact|mobile|cellphone|phone)\b/.test(h)) claim('guardianMobile', i);
  });
  return columns;
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const columns = mapColumns(rows[i]);
    const hasName = 'fullName' in columns || ('firstName' in columns && 'lastName' in columns);
    if (hasName && Object.keys(columns).length >= 3) return { index: i, columns };
  }
  return null;
}

// "Grade 11", "11", "G11", "XI" -> 11
function parseGrade(value) {
  const text = String(value ?? '').trim();
  if (/^xi$/i.test(text)) return 11;
  if (/^xii$/i.test(text)) return 12;
  const match = text.match(/(?:^|\D)(1[12])(?:\D|$)/);
  return match ? Number(match[1]) : NaN;
}

const isBlankName = (s) => !s || !/^[a-zñ]/i.test(s.trim()); // "", "-", "N/A"

// Builds "First M. Last" from separate columns, or from "Last, First, Middle" (the SF1 format).
function composeName(get) {
  const initial = (middle) => (isBlankName(middle) || /^n\/?a$/i.test(middle.trim()) ? '' : `${middle.trim()[0].toUpperCase()}.`);
  if (get('firstName') || get('lastName')) {
    return [get('firstName'), initial(get('middleName')), get('lastName')].filter(Boolean).join(' ');
  }
  const parts = get('fullName').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 3) return [parts[1], initial(parts[2]), parts[0]].filter(Boolean).join(' ');
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`; // "Last, First Middle"
  return get('fullName');
}

// LRNs are 12 digits. Excel turns long numbers into "1.23457E+11" unless the column is Text.
function checkLrn(value) {
  const lrn = String(value ?? '').replace(/[\s']/g, '');
  if (!lrn) return { lrn: null };
  if (/e\+/i.test(lrn)) return { lrn: null, problem: `LRN shows as "${lrn}": format the LRN column as Text in Excel, then save as CSV again` };
  if (!/^\d{12}$/.test(lrn)) return { lrn: null, problem: `LRN "${lrn}" should be 12 digits` };
  return { lrn };
}

const lrnExists = db.prepare('SELECT 1 FROM students WHERE lrn = ?');
const studentExists = db.prepare(`
  SELECT 1 FROM students
  WHERE lower(full_name) = lower(?) AND grade_level = ? AND strand = ? AND lower(section) = lower(?) AND active = 1
`);
const insertStudent = db.prepare(`
  INSERT INTO students (lrn, full_name, grade_level, strand, section, guardian_name, guardian_mobile)
  VALUES (@lrn, @fullName, @gradeLevel, @strand, @section, @guardianName, @guardianMobile)
`);

function importStudents(csvText, { commit = false } = {}) {
  const rows = parseCsv(csvText ?? '');
  const header = findHeader(rows);
  if (!header) {
    throw httpError(400, 'Could not find the column headers. The file needs a header row with at least the '
      + 'student name (or First Name and Last Name), Grade, Strand and Section.');
  }
  const missing = ['gradeLevel', 'strand', 'section'].filter((f) => !(f in header.columns));
  if (missing.length) {
    const names = { gradeLevel: 'Grade', strand: 'Strand', section: 'Section' };
    throw httpError(400, `Could not find a column for: ${missing.map((f) => names[f]).join(', ')}.`);
  }

  const dataRows = rows.slice(header.index + 1);
  if (dataRows.length > MAX_ROWS) throw httpError(400, `The file has more than ${MAX_ROWS} rows. Split it into smaller files.`);

  const seenLrns = new Set();
  const seenStudents = new Set();
  const results = [];

  dataRows.forEach((cells, i) => {
    if (cells.every((c) => !String(c).trim())) return; // blank line
    const get = (field) => (field in header.columns ? String(cells[header.columns[field]] ?? '').trim() : '');
    const { lrn, problem: lrnProblem } = checkLrn(get('lrn'));
    const { fields, problems } = checkFields({
      fullName: composeName(get),
      gradeLevel: parseGrade(get('gradeLevel')),
      strand: get('strand'),
      section: get('section'),
      guardianName: get('guardianName'),
      guardianMobile: get('guardianMobile'),
    }, { requireMobile: false });
    if (lrnProblem) problems.push(lrnProblem);

    const warnings = get('guardianMobile') ? [] : ['no parent mobile number, so no texts until one is added'];
    const studentKey = [fields.fullName.toLowerCase(), fields.gradeLevel, fields.strand, fields.section.toLowerCase()].join('|');
    let status = 'new';
    if (problems.length) status = 'error';
    else if ((lrn && (seenLrns.has(lrn) || lrnExists.get(lrn))) || seenStudents.has(studentKey)
      || studentExists.get(fields.fullName, fields.gradeLevel, fields.strand, fields.section)) status = 'duplicate';
    if (lrn) seenLrns.add(lrn);
    seenStudents.add(studentKey);

    results.push({
      row: header.index + i + 2, // the row number Excel shows
      lrn,
      ...fields,
      // what the file says, even when it's wrong, so staff can find the row ("Grade 13 - Robotics B")
      classLabel: classLabel({
        grade_level: Number.isNaN(fields.gradeLevel) ? get('gradeLevel') || '?' : fields.gradeLevel,
        strand: fields.strand ?? get('strand'),
        section: fields.section,
      }),
      status,
      problems,
      warnings,
    });
  });

  if (commit) {
    db.transaction(() => {
      for (const r of results) {
        if (r.status !== 'new') continue;
        insertStudent.run(r);
        r.status = 'imported';
      }
    })();
  }

  const count = (status) => results.filter((r) => r.status === status).length;
  return {
    columns: Object.fromEntries(Object.entries(header.columns).map(([field, i]) => [field, rows[header.index][i]])),
    summary: {
      rows: results.length,
      new: count('new'),
      imported: count('imported'),
      duplicate: count('duplicate'),
      error: count('error'),
    },
    rows: results,
  };
}

module.exports = { importStudents };
