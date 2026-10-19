// Gate screen: reads the USB RFID reader (it types the card number and presses Enter)
// and shows one of the screens from Figure 3. (US-06, US-07, US-14)
const scan = document.getElementById('scan');
const screen = document.getElementById('screen');
const field = (id) => document.getElementById(id);
const RESET_AFTER_MS = 2500;
let gateName = '';
let resetTimer;

// Keep the hidden input focused so the reader's typing always lands in it.
setInterval(() => scan.focus(), 500);

setInterval(() => {
  field('clock').textContent = new Date().toLocaleTimeString('en-US');
}, 1000);

function show({ state, banner = '', label = '', name = '', strand = '', detail = '', note = '' }) {
  screen.className = state;
  field('banner').textContent = banner;
  field('label').textContent = label;
  field('name').textContent = name;
  field('strand').textContent = strand; // grade, strand and section, e.g. "Grade 12 - STEM A"
  field('detail').textContent = detail;
  field('note').textContent = note;
  clearTimeout(resetTimer);
  if (state !== 'waiting') resetTimer = setTimeout(showWaiting, RESET_AFTER_MS);
}

function showWaiting() {
  show({ state: 'waiting', name: 'Tap your card', detail: gateName });
}

function beep(frequency) {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.frequency.value = frequency;
  osc.connect(ctx.destination);
  osc.start();
  setTimeout(() => { osc.stop(); ctx.close(); }, 150);
}

function now() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function render(reply, uid) {
  // Server not reachable: the tap is saved on this PC and uploaded later (screen 3).
  if (!reply.online) {
    const student = reply.student;
    show({
      state: 'offline',
      banner: 'OFFLINE: TAP SAVED',
      name: student ? student.name : 'Tap saved',
      strand: student ? student.gradeSection : '',
      detail: now(),
      note: 'Text will be sent when back online',
    });
    return beep(880);
  }

  // Came in or went out: green, or amber when late or leaving early.
  const MOVEMENT_LABELS = {
    time_in: reply.isLate ? 'TIME IN (LATE)' : 'TIME IN',
    lunch_out: 'LUNCH OUT',
    lunch_in: reply.isLate ? 'BACK FROM LUNCH (LATE)' : 'BACK FROM LUNCH',
    time_out: 'TIME OUT',
    early_out: 'EARLY OUT',
  };
  if (MOVEMENT_LABELS[reply.result]) {
    let note = reply.smsQueued ? 'Parent will be notified by SMS' : '';
    if (reply.result === 'lunch_out') note = `Enjoy your lunch. Be back by ${reply.backBy}.`;
    show({
      state: reply.isLate || reply.result === 'early_out' ? 'warn' : 'ok',
      label: MOVEMENT_LABELS[reply.result],
      name: reply.name,
      strand: reply.gradeSection,
      detail: now(),
      note,
    });
    return beep(880);
  }

  switch (reply.result) {
    case 'cooldown':
      show({
        state: 'ok',
        label: 'ALREADY TAPPED',
        name: reply.name,
        strand: reply.gradeSection,
        note: 'Your tap was already recorded',
      });
      return beep(880);
    default: // unregistered or inactive card (screen 4)
      show({
        state: 'error',
        label: 'NOT RECOGNIZED',
        name: reply.result === 'inactive' ? 'Card deactivated' : 'Card not registered',
        detail: `Card ${uid}`, // lets the guard or staff look the card up
        note: 'Please see the guard on duty',
      });
      return beep(300);
  }
}

scan.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  const uid = scan.value.trim();
  scan.value = '';
  if (!uid) return;
  render(await window.gate.tap(uid), uid);
});

window.gate.info().then((info) => {
  gateName = info.gateName;
  showWaiting();
});
