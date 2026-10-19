// An error that carries an HTTP status, e.g. httpError(409, 'Card already registered').
// The error handler in index.js sends its message to the page as { error: message }.
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { httpError };
