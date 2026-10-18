// How a student's class is written everywhere: gate screen, texts, server log.
// { grade_level: 12, strand: 'STEM', section: 'A' } -> "Grade 12 - STEM A"
function classLabel(student) {
  const strandSection = [student.strand, student.section].filter(Boolean).join(' ');
  return `Grade ${student.grade_level} - ${strandSection}`;
}

module.exports = { classLabel };
