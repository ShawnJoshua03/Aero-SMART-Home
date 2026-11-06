(() => {
  // While any modal is open, slide Aero down to the bottom edge of the window so he does not sit on the modal.
  // Runs beside aero.js: it only sets the --aero-shift custom property (a CSS translate) and never touches his position.
  const MARGIN = 8;

  function update() {
    const root = document.querySelector('.aero');
    if (!root) return;
    const open = document.body.classList.contains('modal-open');
    // offsetTop/offsetHeight ignore transforms, so this is his real un-shifted position.
    const shift = open ? Math.max(0, window.innerHeight - MARGIN - (root.offsetTop + root.offsetHeight)) : 0;
    const next = shift + 'px';
    if (root.style.getPropertyValue('--aero-shift') !== next) root.style.setProperty('--aero-shift', next);
  }

  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', update);
  // If he is dragged while a modal is open, re-evaluate once he is dropped.
  window.addEventListener('pointerup', () => setTimeout(update, 0));
})();
