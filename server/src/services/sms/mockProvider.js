// Fake SMS provider for development and demos. Prints texts to the console instead of sending them.
// Set MOCK_SMS_FAIL_RATE=0.2 in .env to make 20% of sends fail, to test the queue and retries.
const failRate = Number(process.env.MOCK_SMS_FAIL_RATE) || 0;
let nextId = 1;

module.exports = {
  name: 'mock',

  async send({ to, body }) {
    if (Math.random() < failRate) throw new Error('Mock send failure');
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
