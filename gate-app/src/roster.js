// Local copy of card number -> student name (and LRN -> name), downloaded from the server by sync.js.
// Lets the gate show the student's name even when the server can't be reached (Figure 3, screen 3).
const jsonFile = require('./jsonFile');

const FILE = 'roster.json';
let roster = null; // { cards: { [uid]: { name, gradeSection } }, lrns: { [lrn]: { name, gradeSection } } }

function load() {
  if (!roster) {
    const saved = jsonFile.read(FILE, {});
    // Files saved by older versions held only the cards map.
    roster = saved.cards ? saved : { cards: saved, lrns: {} };
  }
  return roster;
}

// A card number, or an LRN typed by a student without their card.
function lookup(uid) {
  const { cards, lrns } = load();
  return cards[uid] || lrns[uid] || null;
}

function replace(cards, lrns = {}) {
  roster = { cards, lrns };
  jsonFile.write(FILE, roster);
}

module.exports = { lookup, replace };
