window.Canvas.start().catch((error) => {
  console.error(error);
  document.getElementById('save-status').textContent = 'Unable to load workspace. Restart to try again.';
  document.getElementById('canvas').textContent = 'The local demo data or preferences could not be loaded.';
});
