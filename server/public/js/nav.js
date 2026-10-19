// Shared by every dashboard page: sends visitors who aren't logged in to the login page,
// and adds the staff member's name and a "Log out" button to the menu.
// Pages can wait for `currentUser` to know who is logged in.
const currentUser = api('/auth/me').then(({ user }) => {
  const box = document.createElement('div');
  box.className = 'nav-user';
  const name = document.createElement('div');
  name.textContent = `${user.fullName} (${user.role})`;
  const logout = document.createElement('button');
  logout.textContent = 'Log out';
  logout.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    location.href = '/login.html';
  });
  box.append(name, logout);
  document.querySelector('nav').append(box);
  return user;
});
