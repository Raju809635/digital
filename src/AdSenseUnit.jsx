import { useEffect, useRef } from 'react';

const PUBLISHER_ID = 'ca-pub-9806338411535100';
const SLOT_ID = '4899422047';

export default function AdSenseUnit() {
  const slotRef = useRef(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current || !slotRef.current) return;
    requestedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      requestedRef.current = false;
      console.warn('[adsense]', error.message);
    }
  }, []);

  return <aside className="adsense-placement" aria-label="Advertisement">
    <ins
      ref={slotRef}
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client={PUBLISHER_ID}
      data-ad-slot={SLOT_ID}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  </aside>;
}
