import { useEffect, useRef, useState } from 'react';
import '../../styles/google-map.css';

// The Maps JS API is injected at runtime by the loader below, so `window.google`
// only exists after that script resolves. Declared as `unknown`-ish rather than
// pulling in @types/google.maps, which this project does not depend on.
declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
        Marker: new (opts: Record<string, unknown>) => unknown;
        LatLng: new (lat: number, lng: number) => unknown;
        [key: string]: unknown;
      };
    };
  }
}

interface GoogleMapProps {
  lat: number;
  lng: number;
  label?: string;
}

export function GoogleMap({ lat, lng, label }: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Check if script is already loaded
    if (window.google && window.google.maps) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    // Using the key provided in the instructions
    // Key comes from the environment, not the source tree. A committed key is
    // extractable from the bundle by anyone and billable to this account, so
    // it belongs in .env with an HTTP-referrer restriction set in the Google
    // Cloud console.
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!key) { setIsLoaded(false); return; }
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsLoaded(true);
    document.head.appendChild(script);

    return () => {
      // Cleanup if necessary
    };
  }, []);

  useEffect(() => {
    if (isLoaded && mapRef.current && window.google) {
      const position = { lat, lng };
      
      const map = new window.google!.maps.Map(mapRef.current, {
        center: position,
        zoom: 15,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
          // Add more dark mode styling here if needed
        ]
      });

      new window.google!.maps.Marker({
        position,
        map,
        title: label,
        label: label ? { text: label[0], color: 'white' } : undefined
      });
    }
  }, [isLoaded, lat, lng, label]);

  return (
    <div className="google-map-container">
      {!isLoaded && <div className="map-loading">Loading Map...</div>}
      <div ref={mapRef} className="google-map" />
    </div>
  );
}
