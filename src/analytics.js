const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
const validMeasurementId = /^G-[A-Z0-9]+$/i.test(measurementId || '');

export function initializeAnalytics() {
  if (!validMeasurementId || window.doNotTrack === '1' || navigator.doNotTrack === '1') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export function trackEvent(name, params = {}) {
  if (validMeasurementId && typeof window.gtag === 'function') window.gtag('event', name, params);
}
