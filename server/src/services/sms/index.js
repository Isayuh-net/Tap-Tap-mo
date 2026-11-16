// The SMS provider in use: the one chosen on Lunch and SMS settings, or SMS_PROVIDER in .env until
// then. Every provider has the same functions:
//   send({ to, body })            -> { providerMessageId }
//   getStatus(providerMessageId)  -> 'sent' | 'delivered' | 'failed'
//   getBalance()                  -> credits left, or null if unknown
// and may have getStatuses(ids) (many at once) and checkAccount() (Lunch and SMS settings).
// The rest of the system only talks to this module, so switching providers changes nothing else,
// and a change on the dashboard applies to the next text without restarting.
const settings = require('../settings');

const PROVIDERS = {
  mock: { label: 'Test mode (no texts sent)', create: () => require('./mockProvider') },
  semaphore: { label: 'Semaphore', create: (options) => require('./semaphoreProvider')(options) },
  castph: { label: 'Cast PH', create: () => require('./castphProvider') },
};

// A provider from its settings: { provider, senderName, apiUrl, apiKey }
function build(options) {
  const entry = PROVIDERS[options.provider];
  if (!entry) throw new Error(`Unknown SMS provider "${options.provider}"`);
  return entry.create(options);
}

let cached = { key: null, provider: null };
function current() {
  const options = settings.sms();
  const key = JSON.stringify(options);
  if (cached.key !== key) cached = { key, provider: build(options) };
  return cached.provider;
}

// Each text remembers which provider sent it ("semaphore:12345"), so its delivery is only checked
// with that provider. Texts from before the switch (or from older versions, "mock-7") stay as they are.
async function send(message) {
  const provider = current();
  const { providerMessageId } = await provider.send(message);
  return { providerMessageId: `${provider.name}:${providerMessageId}` };
}

// The delivery status of many sent texts: Map(stored id -> 'sent' | 'delivered' | 'failed').
// Providers that can (Semaphore) answer for all of them in one request.
async function getStatuses(storedIds) {
  const provider = current();
  const result = new Map();
  const mine = new Map(); // the provider's own id -> stored id
  for (const stored of storedIds) {
    const colon = stored.indexOf(':');
    const sentBy = colon > 0 ? stored.slice(0, colon) : stored.startsWith('mock-') ? 'mock' : provider.name;
    if (sentBy !== provider.name) result.set(stored, 'sent'); // that provider isn't in use any more, so it can't be asked
    else mine.set(colon > 0 ? stored.slice(colon + 1) : stored, stored);
  }
  if (mine.size) {
    const found = provider.getStatuses
      ? await provider.getStatuses([...mine.keys()])
      : new Map(await Promise.all([...mine.keys()].map(async (id) => [id, await provider.getStatus(id)])));
    for (const [id, stored] of mine) result.set(stored, found.get(id) ?? 'sent');
  }
  return result;
}

module.exports = {
  get name() { return current().name; },
  send,
  getStatuses,
  getBalance: () => current().getBalance(),
  build,
  PROVIDERS,
};
