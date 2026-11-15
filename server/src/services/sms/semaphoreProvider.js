// Semaphore (semaphore.co), a Philippine SMS provider. Chosen on Lunch and SMS settings with the
// API key from the school's Semaphore account and a sender name Semaphore has approved.
//   Send:    POST {apiUrl}  (default https://api.semaphore.co/api/v4/messages)
//            form fields apikey, number, message, sendername -> [{ message_id, status, ... }]
//   Status:  GET  .../messages/{id}?apikey=  -> status Pending, Queued, Sent, Failed or Refunded
//   Credits: GET  .../account?apikey=        -> { credit_balance }
// A wrong number fails for good; anything else (no internet, no credits, wrong key) is retried
// by the queue, so texts go out once it's fixed.
const DEFAULT_URL = 'https://api.semaphore.co/api/v4/messages';
const TIMEOUT_MS = 15 * 1000;

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

module.exports = function semaphoreProvider({ apiUrl, apiKey, senderName }) {
  const messagesUrl = (apiUrl || DEFAULT_URL).replace(/\/+$/, '');
  const baseUrl = messagesUrl.replace(/\/messages$/, '');

  async function call(url, options = {}) {
    if (!apiKey) throw new Error('No Semaphore API key. Add it on Lunch and SMS settings.');
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  }

  return {
    name: 'semaphore',

    async send({ to, body: message }) {
      const form = new URLSearchParams({ apikey: apiKey, number: to, message });
      if (senderName) form.set('sendername', senderName);
      const { ok, status, body } = await call(messagesUrl, { method: 'POST', body: form });
      const sent = Array.isArray(body) ? body[0] : null;
      if (ok && sent?.message_id) return { providerMessageId: String(sent.message_id) };
      const err = new Error(`Semaphore: ${errorText(body)}`);
      // Only a bad number is permanent; a server error or a problem with the account is retried.
      err.permanent = status < 500 && /number/i.test(errorText(body)) && !/credit|balance/i.test(errorText(body));
      throw err;
    },

    async getStatus(messageId) {
      const { ok, body } = await call(`${baseUrl}/messages/${encodeURIComponent(messageId)}?apikey=${encodeURIComponent(apiKey)}`);
      if (!ok) throw new Error(`Semaphore: ${errorText(body)}`);
      const message = Array.isArray(body) ? body[0] : body;
      return STATUSES[String(message?.status).toLowerCase()] ?? 'sent';
    },

    async getBalance() {
      const { ok, body } = await call(`${baseUrl}/account?apikey=${encodeURIComponent(apiKey)}`);
      if (!ok) throw new Error(`Semaphore: ${errorText(body)}`);
      const credits = Number(body?.credit_balance);
      return Number.isFinite(credits) ? credits : null;
    },
  };
};

module.exports.DEFAULT_URL = DEFAULT_URL;
