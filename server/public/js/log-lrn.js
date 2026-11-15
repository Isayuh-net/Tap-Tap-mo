// Log by LRN: staff type the LRN of a student who forgot their card. It counts like a tap at the
// gate (time in, lunch, time out) and texts the parent the same way.
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// What the parent got, in words
function textNote(reply) {
  if (reply.smsQueued) return 'The parent is being texted.';
  if (reply.result === 'lunch_out' || (reply.result === 'lunch_in' && !reply.isLate)) return 'Lunch taps are not texted.';
  return 'No text: the parent\'s number isn\'t verified yet.';
}

function showResult(kind, children) {
  $('result').className = `result-card ${kind}`;
  $('result').replaceChildren(...children);
  $('result').hidden = false;
}

function showReply(reply) {
  if (reply.result === 'cooldown') {
    showResult('late', [el('div', {},
      el('div', { className: 'big', textContent: `${reply.name} was just logged` }),
      el('div', { textContent: 'Wait 30 seconds before logging the same student again.' }))]);
    return;
  }
  if (reply.result === 'inactive') {
    showResult('error', [el('div', { className: 'big', textContent: `${reply.name} is not active in the system` })]);
    return;
  }
  const photo = reply.photoVersion
    ? el('img', { className: 'avatar', src: `/api/students/${reply.studentId}/photo?v=${reply.photoVersion}`, alt: '' })
    : el('span', { className: 'avatar empty', textContent: reply.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('') });
  const extra = reply.backBy ? ` Back by ${reply.backBy}.` : '';
  showResult(reply.isLate || reply.result === 'early_out' ? 'late' : 'ok', [photo, el('div', {},
    el('div', { className: 'big', textContent: `${reply.loggedAs}: ${reply.name}` }),
    el('div', { textContent: `${reply.classLabel}${reply.schoolId ? `, ID ${reply.schoolId}` : ''}. ${textNote(reply)}${extra}` }))]);
}

async function loadToday() {
  const { entries } = await api('/attendance/lrn-today');
  $('rows').replaceChildren(...(entries.length ? entries.map((e) => el('tr', {},
    el('td', { textContent: e.time }),
    el('td', { className: 'strong', textContent: e.name }),
    el('td', { className: 'mono', textContent: e.lrn }),
    el('td', { textContent: e.classLabel }),
    el('td', { textContent: e.loggedAs }),
    el('td', { textContent: e.where }),
  )) : [el('tr', { className: 'empty-row' }, el('td', { colSpan: 6, textContent: 'Nobody has been logged by LRN today.' }))]));
}

$('lrn').addEventListener('input', () => {
  $('lrn').value = $('lrn').value.replace(/[^\d ]/g, ''); // digits only (spaces are allowed while typing)
});

$('lrn-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const lrn = $('lrn').value.replace(/\s/g, '');
  if (!/^\d{12}$/.test(lrn)) {
    showResult('error', [el('div', { className: 'big', textContent: `An LRN has 12 digits (this has ${lrn.length}).` })]);
    return;
  }
  try {
    showReply(await api('/attendance/lrn', { method: 'POST', body: { lrn } }));
    $('lrn').value = '';
    loadToday();
  } catch (err) {
    showResult('error', [el('div', { className: 'big', textContent: err.message })]);
  }
  $('lrn').focus();
});

loadToday().catch((err) => showResult('error', [el('div', { textContent: err.message })]));
setInterval(() => loadToday().catch(() => {}), 30 * 1000);
