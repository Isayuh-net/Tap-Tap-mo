// Picks the SMS provider from SMS_PROVIDER in .env. Every provider has the same functions:
//   send({ to, body })            -> { providerMessageId }
//   getStatus(providerMessageId)  -> 'sent' | 'delivered' | 'failed'
//   getBalance()                  -> credits left, or null if unknown
// The rest of the system only talks to this module, so switching providers changes nothing else.
const config = require('../../config');

const providers = {
  mock: require('./mockProvider'),
  castph: require('./castphProvider'),
};

const provider = providers[config.sms.provider];
if (!provider) throw new Error(`Unknown SMS_PROVIDER "${config.sms.provider}"`);

module.exports = provider;
