// Shared by every dashboard page: builds the sidebar (school logo, menu, who is logged in, who
// made the system), sends visitors who aren't logged in to the login page, and adds "Log out".
// Pages can wait for `currentUser` to know who is logged in. Everything else here stays inside
// this function, so its names don't clash with the page's own scripts.
const currentUser = (() => {
  const SCHOOL = 'Baguio City National High School';
  const MADE_BY = 'Isaiah Angelo G. Masing and Anthon Rovic E. Belarde';

  // [page, label, roles allowed (empty = everyone)], or [heading] to start a group.
  // Add new pages here, not in each HTML file.
  const MENU = [
    ['index.html', 'Dashboard', []],
    ['students.html', 'Students', []],
    ['log-lrn.html', 'Log by LRN', ['admin', 'staff']],
    ['reports.html', 'Reports and files', []],
    ['settings.html', 'Lunch and SMS settings', ['admin']],
    ['Cards and parents'],
    ['register.html', 'Register card', ['admin', 'staff']],
    ['assign-cards.html', 'Assign cards', ['admin', 'staff']],
    ['import.html', 'Import students', ['admin', 'staff']],
    ['verify-class.html', 'Verify numbers', []],
    ['sms-log.html', 'SMS log', ['admin', 'staff']],
  ];

  const navNode = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  document.head.append(navNode('link', { rel: 'icon', href: 'img/logo.png' }));

  const navElement = document.querySelector('nav');
  const currentPage = location.pathname.split('/').pop() || 'index.html';

  const brand = navNode('a', { className: 'brand', href: 'index.html' },
    navNode('img', { src: 'img/logo.png', alt: '' }),
    navNode('div', {}, navNode('div', { className: 'brand-name', textContent: SCHOOL }), navNode('div', { className: 'brand-sub', textContent: 'Tap-Tap Mo attendance' })));

  const links = navNode('div', { className: 'nav-links' });
  const menuLinks = [];
  let group = null;
  for (const [page, label, roles] of MENU) {
    if (!label) {
      group = navNode('div', { className: 'nav-group', textContent: page });
      links.append(group);
      continue;
    }
    const link = navNode('a', { href: page, textContent: label });
    if (page === currentPage) {
      link.className = 'active';
      link.setAttribute('aria-current', 'page');
    }
    links.append(link);
    menuLinks.push({ link, roles, group });
  }

  const foot = navNode('div', { className: 'nav-foot' });
  navElement.replaceChildren(brand, links, foot);
  navElement.setAttribute('aria-label', 'Main menu');

  return api('/auth/me').then(({ user }) => {
    for (const { link, roles } of menuLinks) {
      if (roles.length && !roles.includes(user.role)) link.remove();
    }
    // A group heading with no pages left for this user goes too.
    for (const heading of links.querySelectorAll('.nav-group')) {
      if (!heading.nextElementSibling || heading.nextElementSibling.classList.contains('nav-group')) heading.remove();
    }
    const logout = navNode('button', { type: 'button', textContent: 'Log out' });
    logout.addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      location.href = '/login.html';
    });
    foot.append(
      navNode('div', { className: 'nav-user' },
        navNode('div', {}, navNode('div', { className: 'who', textContent: user.fullName }), navNode('div', { className: 'role', textContent: user.role })),
        logout),
      navNode('div', { className: 'made-by' }, navNode('div', { className: 'muted-label', textContent: 'Made by' }), navNode('strong', { textContent: MADE_BY })),
    );
    return user;
  });
})();
