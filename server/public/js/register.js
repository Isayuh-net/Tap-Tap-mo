// Registration page (Figure 6): tap a card, fill in the student and parent details, then verify
// the parent's number with a texted code. (US-05, US-08)
const $ = (id) => document.getElementById(id);
const message = $('message');
const cardStatus = $('card-status');
const FIELDS = ['fullName', 'gradeLevel', 'strand', 'section', 'guardianName', 'guardianMobile'];

let studentId = null; // set once the student is saved
let lastCheckedUid = '';

api('/students/strands').then(({ strands }) => {
  for (const strand of strands) $('strand').add(new Option(strand, strand));
});

function formValues() {
  return Object.fromEntries(FIELDS.map((id) => [id, $(id).value]));
}

function fillForm(student) {
  for (const id of FIELDS) $(id).value = student[id] ?? '';
}

// The reader types the card number and presses Enter: check the card, then go to the name.
$('uid').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  checkCard();
  $('fullName').focus();
});
$('uid').addEventListener('change', checkCard);

async function checkCard() {
  const uid = $('uid').value.trim();
  if (!uid || uid === lastCheckedUid || studentId) return;
  lastCheckedUid = uid;
  showMessage(message, '', '');
  try {
    const found = await api(`/cards/${encodeURIComponent(uid)}`);
    if (!found.registered) {
      cardStatus.textContent = 'New card. Fill in the details below.';
      $('send').disabled = false;
      return;
    }
    const s = found.student;
    if (found.cardStatus !== 'active') {
      showMessage(message, 'error', `This card was deactivated (${found.cardStatus}). Use a different card.`);
      $('send').disabled = true;
    } else if (s.mobileVerified) {
      showMessage(message, 'error', `This card is already registered to ${s.fullName} (${s.classLabel}).`);
      $('send').disabled = true;
    } else {
      // Saved earlier but never verified: continue where it stopped.
      studentId = s.id;
      fillForm(s);
      $('uid').disabled = true;
      $('send').textContent = 'Save and send a new code';
      showMessage(message, 'info',
        `Continuing the registration of ${s.fullName}. The parent's number is not verified yet. Check the details, then send a code.`);
    }
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
}

// Saves the student (new or edited), then texts a code to the parent.
$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('send').disabled = true; // no double clicks
  try {
    const body = formValues();
    const student = studentId
      ? await api(`/students/${studentId}`, { method: 'PUT', body })
      : await api('/students', { method: 'POST', body: { ...body, uid: $('uid').value } });
    studentId = student.id;
    $('uid').disabled = true; // the card is linked now
    $('send').textContent = 'Save and send a new code';

    const sent = await api('/verification/send', { method: 'POST', body: { studentId } });
    const testNote = sent.testMode ? ' (Test mode: the code is printed in the server window, not texted.)' : '';
    showMessage(message, 'ok',
      `Saved. A code was texted to ${sent.sentTo}. Ask the parent for it; it works for ${sent.expiresInMinutes} minutes.${testNote}`);
    $('verify-step').disabled = false;
    $('code').value = '';
    $('code').focus();
  } catch (err) {
    showMessage(message, 'error', err.message);
  } finally {
    $('send').disabled = false;
  }
});

async function verify() {
  try {
    const { mobile } = await api('/verification/confirm', { method: 'POST', body: { studentId, code: $('code').value } });
    showMessage(message, 'ok', `Done! ${$('fullName').value} is registered. Attendance texts will go to ${mobile}.`);
    $('details').disabled = true;
    $('verify-step').disabled = true;
    $('next').focus();
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
}

$('verify').addEventListener('click', verify);
$('code').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  verify();
});

// Clears everything for the next student.
$('next').addEventListener('click', () => {
  studentId = null;
  lastCheckedUid = '';
  $('form').reset();
  $('details').disabled = false;
  $('verify-step').disabled = true;
  $('uid').disabled = false;
  $('send').disabled = false;
  $('send').textContent = 'Save and send verification code';
  showMessage(message, '', '');
  cardStatus.textContent = 'Click here first if the number doesn\'t appear.';
  $('uid').focus();
});
