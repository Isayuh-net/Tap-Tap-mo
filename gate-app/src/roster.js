// Local copy of card number -> student name, downloaded from the server by sync.js.
// Lets the gate show the student's name even when the server can't be reached (Figure 3, screen 3).
const jsonFile = require('./jsonFile');

const FILE = 'roster.json';
let cards = null; // { [uid]: { name, gradeSection } }

function lookup(uid) {
  if (!cards) cards = jsonFile.read(FILE, {});
  return cards[uid] || null;
}

function replace(newCards) {
  cards = newCards;
  jsonFile.write(FILE, cards);
}

module.exports = { lookup, replace };
