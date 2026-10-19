// Shared by every dashboard page: fills in the menu, sends visitors who aren't logged in to the
// login page, and adds the staff member's name and a "Log out" button.
// Pages can wait for `currentUser` to know who is logged in.

// [page, label, roles allowed (empty = everyone)]. Add new pages here, not in each HTML file.
const MENU = [
  ['index.html', 'Dashboard', []],
  ['students.html', 'Students', []],
  ['register.html', 'Register card', ['admin', 'staff']],
  ['import.html', 'Import students', ['admin', 'staff']],
  ['assign-cards.html', 'Assign cards', ['admin', 'staff']],
  ['verify-class.html', 'Verify numbers', []],
  ['sms-log.html', 'SMS log', ['admin', 'staff']],
  ['reports.html', 'Reports', []],
];

const navElement = document.querySelector('nav');
const currentPage = location.pathname.split('/').pop() || 'index.html';
const menuLinks = MENU.map(([page, label, roles]) => {
  const link = document.createElement('a');
  link.href = page;
  link.textContent = label;
  if (page === currentPage) link.className = 'active';
  navElement.append(link);
  return { link, roles };
});

const currentUser = api('/auth/me').then(({ user }) => {
  for (const { link, roles } of menuLinks) {
    if (roles.length && !roles.includes(user.role)) link.remove();
  }
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
  navElement.append(box);
  return user;
});
