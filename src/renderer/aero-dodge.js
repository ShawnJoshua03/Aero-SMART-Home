(() => {
  // While any modal is open, slide Aero (and his tab) down to the bottom edge of the window so they do not sit on the modal.
  // Runs beside aero.js: it only sets the --aero-shift custom property (a CSS translate) and never touches positions.
  const MARGIN = 8;

  function update() {
    const open = document.body.classList.contains('modal-open');
    document.querySelectorAll('.aero, .aero-tab').forEach((el) => {
      // offsetTop/offsetHeight ignore transforms, so this is the element's real un-shifted position.
      const shift = open && el.offsetHeight ? Math.max(0, window.innerHeight - MARGIN - (el.offsetTop + el.offsetHeight)) : 0;
      const next = shift + 'px';
      if (el.style.getPropertyValue('--aero-shift') !== next) el.style.setProperty('--aero-shift', next);
    });
  }

  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', update);
})();
