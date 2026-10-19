// Small fetch helper shared by every dashboard page.
// Sends to the login page when the session has expired, and throws the server's error message.
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && !location.pathname.endsWith('login.html')) {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname)}`;
    return new Promise(() => {}); // stop here while the page changes
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Shows a message in an element: kind is 'ok', 'error' or 'info'. Empty text hides it.
function showMessage(el, kind, text) {
  el.className = `message ${kind}`;
  el.textContent = text;
}
