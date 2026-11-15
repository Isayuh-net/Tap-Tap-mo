// The SMS provider in use: the one chosen on Lunch and SMS settings, or SMS_PROVIDER in .env until
// then. Every provider has the same functions:
//   send({ to, body })            -> { providerMessageId }
//   getStatus(providerMessageId)  -> 'sent' | 'delivered' | 'failed'
//   getBalance()                  -> credits left, or null if unknown
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

async function getStatus(stored) {
  const provider = current();
  const colon = stored.indexOf(':');
  const sentBy = colon > 0 ? stored.slice(0, colon) : stored.startsWith('mock-') ? 'mock' : provider.name;
  if (sentBy !== provider.name) return 'sent'; // that provider isn't in use any more, so it can't be asked
  return provider.getStatus(colon > 0 ? stored.slice(colon + 1) : stored);
}

module.exports = {
  get name() { return current().name; },
  send,
  getStatus,
  getBalance: () => current().getBalance(),
  build,
  PROVIDERS,
};
