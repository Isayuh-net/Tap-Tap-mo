// Fake SMS provider for development and demos. Prints texts to the console instead of sending them.
//  - MOCK_SMS_FAIL_RATE=0.2 in .env makes 20% of sends fail (like a dropped connection),
//    to test the queue and retries.
//  - Numbers ending in 0000 are treated as invalid, to test the "failed" status.
const failRate = Number(process.env.MOCK_SMS_FAIL_RATE) || 0;
let nextId = 1;

module.exports = {
  name: 'mock',

  async send({ to, body }) {
    if (to.endsWith('0000')) {
      const err = new Error('Invalid number');
      err.permanent = true; // retrying will not help
      throw err;
    }
    if (Math.random() < failRate) throw new Error('Mock connection failure');
    const providerMessageId = `mock-${nextId++}`;
    console.log(`[SMS to ${to}] ${body}`);
    return { providerMessageId };
  },

  async getStatus() {
    return 'delivered';
  },

  async getBalance() {
    return null;
  },
};
