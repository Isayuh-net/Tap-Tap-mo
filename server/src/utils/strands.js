// Senior High School strands. Fills the dropdown on the registration page and checks input.
// Edit this list to match the strands BCNHS Senior High actually offers.
const STRANDS = ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL-ICT', 'TVL-HE', 'TVL-IA', 'TVL-AFA', 'Arts and Design', 'Sports'];

// "stem" -> "STEM", "arts and design" -> "Arts and Design". Returns null if it is not in the list.
function canonicalStrand(input) {
  const wanted = String(input ?? '').trim().toLowerCase();
  return STRANDS.find((strand) => strand.toLowerCase() === wanted) ?? null;
}

module.exports = { STRANDS, canonicalStrand };
