// The Senior High School strands BCNHS offers. Fills the strand dropdowns and checks input.
// To add or remove a strand, edit this list.
const STRANDS = ['STEM', 'ABM', 'HUMSS', 'TVL'];

// Other ways a strand may be written, for example in an enrollment file.
// Compared in lowercase with punctuation removed.
const OTHER_NAMES = {
  STEM: ['science technology engineering and mathematics', 'science technology engineering mathematics'],
  ABM: ['accountancy business and management', 'accountancy business management'],
  HUMSS: ['humanities and social sciences', 'humanities and social science'],
  TVL: ['technical vocational livelihood', 'technical vocational and livelihood', 'tech voc'],
};

// "stem" -> "STEM", "Humanities and Social Sciences" -> "HUMSS", "TVL-ICT" -> "TVL".
// Returns null if it is not one of the strands.
function canonicalStrand(input) {
  const wanted = String(input ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!wanted) return null;
  const matches = (name) => wanted === name || wanted.startsWith(`${name} `);
  for (const strand of STRANDS) {
    if (matches(strand.toLowerCase()) || (OTHER_NAMES[strand] ?? []).some(matches)) return strand;
  }
  return null;
}

module.exports = { STRANDS, canonicalStrand };
