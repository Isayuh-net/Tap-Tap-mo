// Semaphore (semaphore.co), a Philippine SMS provider. https://semaphore.co/docs
//   Send:    POST {apiUrl} (default https://api.semaphore.co/api/v4/messages), form fields apikey,
//            number, message, sendername -> [{ message_id, status, ... }]. At most 120 a minute.
//   Status:  GET  .../messages?startDate=&limit=1000 (30 a minute) or .../messages/{id}:
//            Queued or Pending (on the way), Sent (reached the network), Failed or Refunded
//   Account: GET  .../account (credit_balance) and .../account/sendernames, 2 a minute each
// The sender name must be one registered on the school's Semaphore account. A wrong number fails for
// good; anything else (no internet, no credits, wrong key, too many texts a minute) is retried by
// the queue, so texts go out once it's fixed. The API key never appears in errors or logs.
const DEFAULT_URL = 'https://api.semaphore.co/api/v4/messages';
const TIMEOUT_MS = 15 * 1000;
const MIN_GAP_MS = 550; // about 109 texts a minute, under Semaphore's 120

const STATUSES = { pending: 'sent', queued: 'sent', sent: 'delivered', failed: 'failed', refunded: 'failed' };

// Every message in an error reply, e.g. { number: ['The number format is invalid.'] } -> that text
function errorText(body) {
  if (typeof body === 'string') return body.slice(0, 200);
  const texts = [];
  const walk = (value) => {
    if (typeof value === 'string') texts.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(body);
  return texts.join(' ').slice(0, 200) || 'Semaphore did not accept the text';
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const manilaDate = (date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

module.exports = function semaphoreProvider({ apiUrl, apiKey, senderName }) {
  const messagesUrl = (apiUrl || DEFAULT_URL).replace(/\/+$/, '');
  const baseUrl = messagesUrl.replace(/\/messages$/, '');
  const hideKey = (text) => (apiKey ? String(text).split(apiKey).join('***') : String(text));
  let lastSendAt = 0;

  async function call(url, options = {}) {
    if (!apiKey) throw new Error('No Semaphore API key. Add it on Lunch and SMS settings or in server/.env.');
    let res;
    try {
      res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new Error(`Semaphore could not be reached (${hideKey(err.cause?.code ?? err.message)})`);
    }
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (res.status === 429) throw new Error('Semaphore: too many requests this minute, trying again later');
    return { ok: res.ok, status: res.status, body };
  }

  const withKey = (path, params = {}) => `${baseUrl}${path}?${new URLSearchParams({ ...params, apikey: apiKey })}`;
  const fail = (body) => new Error(`Semaphore: ${hideKey(errorText(body))}`);

  return {
    name: 'semaphore',

    async send({ to, body: message }) {
      const gap = lastSendAt + MIN_GAP_MS - Date.now();
      if (gap > 0) await wait(gap);
      lastSendAt = Date.now();
      const form = new URLSearchParams({ apikey: apiKey, number: to, message });
      if (senderName) form.set('sendername', senderName);
      const { ok, status, body } = await call(messagesUrl, { method: 'POST', body: form });
      const sent = Array.isArray(body) ? body[0] : null;
      if (ok && sent?.message_id) return { providerMessageId: String(sent.message_id) };
      const err = fail(body);
      // Only a bad number is permanent; a problem with the account or the server is retried.
      const text = errorText(body);
      err.permanent = status < 500 && /number/i.test(text) && !/credit|balance|sender/i.test(text);
      throw err;
    },

    async getStatus(messageId) {
      const { ok, body } = await call(withKey(`/messages/${encodeURIComponent(messageId)}`));
      if (!ok) throw fail(body);
      const message = Array.isArray(body) ? body[0] : body;
      return STATUSES[String(message?.status).toLowerCase()] ?? 'sent';
    },

    // Many texts at once with one request per 1,000 texts, from yesterday onward:
    // Map(messageId -> 'sent' | 'delivered' | 'failed'). Ids not found stay 'sent'.
    async getStatuses(messageIds) {
      const wanted = new Set(messageIds.map(String));
      const found = new Map();
      const startDate = manilaDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
      for (let page = 1; page <= 3 && found.size < wanted.size; page++) {
        const { ok, body } = await call(withKey('/messages', { startDate, limit: 1000, page }));
        if (!ok) throw fail(body);
        const list = Array.isArray(body) ? body : [];
        for (const m of list) {
          if (wanted.has(String(m.message_id))) found.set(String(m.message_id), STATUSES[String(m.status).toLowerCase()] ?? 'sent');
        }
        if (list.length < 1000) break;
      }
      return found;
    },

    async getBalance() {
      const { ok, body } = await call(withKey('/account'));
      if (!ok) throw fail(body);
      const account = Array.isArray(body) ? body[0] : body;
      const credits = Number(account?.credit_balance);
      return Number.isFinite(credits) ? credits : null;
    },

    // For Lunch and SMS settings: { accountName, status, credits, senderNames: [{ name, status }] }
    async checkAccount() {
      const [account, names] = [await call(withKey('/account')), await call(withKey('/account/sendernames'))];
      if (!account.ok) throw fail(account.body);
      const a = Array.isArray(account.body) ? account.body[0] : account.body;
      const list = Array.isArray(names.body) ? names.body : Array.isArray(names.body?.data) ? names.body.data : [];
      return {
        accountName: a?.account_name ?? null,
        status: a?.status ?? null,
        credits: Number.isFinite(Number(a?.credit_balance)) ? Number(a.credit_balance) : null,
        senderNames: names.ok ? list.map((s) => ({ name: s.name, status: s.status ?? null })) : null,
      };
    },
  };
};

module.exports.DEFAULT_URL = DEFAULT_URL;
