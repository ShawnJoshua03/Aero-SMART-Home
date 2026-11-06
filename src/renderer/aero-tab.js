(() => {
  // Aero lives off-screen. A small semicircle tab on the bottom-right edge calls him out; he goes back after 10 s of inactivity.
  // Runs beside aero.js and only toggles classes and attributes on his root element.
  const root = document.querySelector('.aero');
  if (!root) return;
  const IDLE_MS = 10000;
  const BUSY_MOODS = ['listening', 'thinking', 'speaking'];

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'aero-tab';
  tab.setAttribute('aria-label', 'Call Aero');
  tab.setAttribute('aria-expanded', 'false');
  tab.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
  document.body.appendChild(tab);

  root.inert = true;
  root.setAttribute('aria-hidden', 'true');

  let lastActivity = Date.now();
  const bump = () => { lastActivity = Date.now(); };

  function show() {
    root.classList.add('is-out');
    root.inert = false;
    root.removeAttribute('aria-hidden');
    tab.hidden = true;
    tab.setAttribute('aria-expanded', 'true');
    bump();
  }
  function hide() {
    if (root.contains(document.activeElement)) document.activeElement.blur();
    root.classList.remove('is-out');
    root.inert = true;
    root.setAttribute('aria-hidden', 'true');
    tab.hidden = false;
    tab.setAttribute('aria-expanded', 'false');
  }

  tab.addEventListener('click', show);
  // Anything he does or anything done to him counts as activity.
  ['pointerdown', 'pointermove', 'keydown', 'focusin'].forEach((type) => root.addEventListener(type, bump));
  new MutationObserver(bump).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-mood', 'hidden', 'src'] });

  setInterval(() => {
    if (!root.classList.contains('is-out')) return;
    if (BUSY_MOODS.includes(root.dataset.mood)) { bump(); return; } // never leave mid-conversation
    if (Date.now() - lastActivity >= IDLE_MS) hide();
  }, 500);
})();
