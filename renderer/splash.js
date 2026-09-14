window.splash.onProgress(({ percent, text }) => {
  const fill = document.getElementById('progress-fill');
  const status = document.getElementById('status-text');
  if (typeof percent === 'number') fill.style.width = `${Math.max(4, Math.min(100, percent))}%`;
  if (text) status.textContent = text;
});
