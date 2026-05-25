/* Registers the service worker so the app is installable and works offline. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
