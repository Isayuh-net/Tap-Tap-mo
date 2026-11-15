// Student photos, shown on the gate screen when a student taps. (Uploaded on the Students page.)
// Each photo is one JPEG in PHOTOS_DIR named by the student's id, e.g. data/photos/42.jpg.
// The dashboard shrinks photos before uploading, so they stay small (about 50 KB).
// students.photo_updated_at changes with every upload; gates use it to know when to download again.
// Photos are personal data of minors: the folder is git-ignored and only staff and gates can read it.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');
const { httpError } = require('../utils/httpError');

const MAX_BYTES = 1024 * 1024;

const findStudent = db.prepare('SELECT id FROM students WHERE id = ?');
const setUpdatedAt = db.prepare('UPDATE students SET photo_updated_at = ? WHERE id = ?');

const fileFor = (studentId) => path.join(config.photosDir, `${Number(studentId)}.jpg`);

// What gates and pages get: a number that changes whenever the photo changes, or null for no photo.
function photoVersion(student) {
  return student?.photo_updated_at ? Date.parse(student.photo_updated_at) : null;
}

function requireStudent(studentId) {
  if (!Number.isInteger(studentId) || !findStudent.get(studentId)) throw httpError(404, 'Student not found');
}

// Saves a JPEG (a Buffer). Returns { photoVersion }.
function save(studentId, data) {
  requireStudent(studentId);
  if (!Buffer.isBuffer(data) || data.length === 0) throw httpError(400, 'Choose a photo to upload');
  if (data.length > MAX_BYTES) throw httpError(400, 'The photo is too large (1 MB at most)');
  // Every JPEG starts with these bytes; anything else is refused.
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw httpError(400, 'The photo must be a JPEG');

  fs.mkdirSync(config.photosDir, { recursive: true });
  const file = fileFor(studentId);
  // Write to a temporary name first, so a power cut never leaves a half-written photo.
  fs.writeFileSync(`${file}.tmp`, data);
  fs.renameSync(`${file}.tmp`, file);
  const updatedAt = new Date().toISOString();
  setUpdatedAt.run(updatedAt, studentId);
  return { photoVersion: Date.parse(updatedAt) };
}

function remove(studentId) {
  requireStudent(studentId);
  fs.rmSync(fileFor(studentId), { force: true });
  setUpdatedAt.run(null, studentId);
  return { photoVersion: null };
}

// Path of the student's photo, or null if they have none.
function filePath(studentId) {
  const file = fileFor(studentId);
  return Number.isInteger(studentId) && fs.existsSync(file) ? file : null;
}

module.exports = { save, remove, filePath, photoVersion, MAX_BYTES };
