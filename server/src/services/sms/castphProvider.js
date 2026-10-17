// Cast PH SMS provider. Fill this in once Cast PH gives you their API documentation.
//
// Confirm with Cast PH:
//  - The API endpoint and how to authenticate (API key, or username and password).
//  - How to check delivery status. Our server is only on the school network, so Cast PH cannot
//    call it (webhooks). We need an endpoint that our server calls to ask for a message's status.
//  - How to check the remaining credit balance (for the dashboard, US-12).
//  - Which error codes mean "invalid number" (don't retry) and which are temporary (retry).
//  - Registering "BCNHS" as the sender name.

function notReady() {
  throw new Error('Cast PH provider is not set up yet. Use SMS_PROVIDER=mock for now.');
}

module.exports = {
  name: 'castph',
  async send() { notReady(); },        // ({ to, body }) -> { providerMessageId }
  async getStatus() { notReady(); },   // (providerMessageId) -> 'sent' | 'delivered' | 'failed'
  async getBalance() { notReady(); },  // () -> credits left
};
