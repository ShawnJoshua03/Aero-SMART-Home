window.Widgets.register({
  id: 'hello',
  title: 'Patient check-in',
  sizes: ['S', 'M', 'L'],
  render(el, { data, patientId, size }) {
    const patient = data.patients.find(item => item.id === patientId);
    const entries = data.entries.filter(item => item.patientId === patientId);
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = data.survey.title;
    const heading = document.createElement('h3');
    heading.textContent = `Hello, ${patient?.name.split(' ')[0] ?? 'there'}.`;
    const summary = document.createElement('p');
    summary.textContent = `${entries.length} daily check-ins across ${data.period.expectedDays} days.`;
    el.append(eyebrow, heading, summary);
    if (size !== 'S') {
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = 'A space for the signals that matter. Add widgets from the tray to make this view your own.';
      el.append(detail);
    }
  },
});
