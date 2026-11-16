// Login page: sends the username and password, then goes back to the page that sent us here.
const form = document.getElementById('login');
const message = document.getElementById('message');

// Go back to the page that sent us here, but only within this site ("//site" and "/\site" lead away).
function nextPage() {
  const next = new URLSearchParams(location.search).get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/index.html';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/auth/login', {
      method: 'POST',
      body: {
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      },
    });
    location.href = nextPage();
  } catch (err) {
    showMessage(message, 'error', err.message);
  }
});
