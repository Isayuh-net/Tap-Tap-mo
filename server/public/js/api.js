// Small fetch helper shared by every dashboard page.
// Sends to the login page when the session has expired, and throws the server's error message.
// The body is sent as JSON, except a file (Blob), which is sent as it is (used for photos).
async function api(path, options = {}) {
  const file = options.body instanceof Blob;
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': file ? options.body.type : 'application/json' },
    ...options,
    body: file ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && !location.pathname.endsWith('login.html')) {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname)}`;
    return new Promise(() => {}); // stop here while the page changes
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Downloads a file from the API (like an Excel report) and saves it with the server's file name.
// Errors are thrown with the server's message. Returns { fileName, savedTo } (savedTo: where the
// server also saved a copy, if it did).
async function downloadFile(path) {
  const res = await fetch(`/api${path}`);
  if (res.status === 401) {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname)}`;
    return new Promise(() => {});
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Download failed (${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const fileName = encoded ? decodeURIComponent(encoded) : /filename="([^"]+)"/i.exec(disposition)?.[1] ?? 'download';
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  const saved = res.headers.get('X-Saved-To');
  return { fileName, savedTo: saved ? decodeURIComponent(saved) : null };
}

// Shows a message in an element: kind is 'ok', 'error' or 'info'. Empty text hides it.
function showMessage(el, kind, text) {
  el.className = `message ${kind}`;
  el.textContent = text;
}
