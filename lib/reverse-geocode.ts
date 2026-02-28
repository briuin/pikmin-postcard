type ReverseGeocodeAddress = {
  country?: string;
  state?: string;
  region?: string;
  province?: string;
  state_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  county?: string;
};

type ReverseGeocodeResponse = {
  address?: ReverseGeocodeAddress;
};

export type ReverseGeocodeResult = {
  city: string | null;
  state: string | null;
  country: string | null;
};

function toNullableTrimmedText(value: string | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function pickCity(address?: ReverseGeocodeAddress): string | null {
  return (
    toNullableTrimmedText(address?.city, 120) ??
    toNullableTrimmedText(address?.town, 120) ??
    toNullableTrimmedText(address?.village, 120) ??
    toNullableTrimmedText(address?.municipality, 120) ??
    toNullableTrimmedText(address?.hamlet, 120) ??
    toNullableTrimmedText(address?.county, 120)
  );
}

function pickState(address?: ReverseGeocodeAddress): string | null {
  return (
    toNullableTrimmedText(address?.state, 120) ??
    toNullableTrimmedText(address?.region, 120) ??
    toNullableTrimmedText(address?.province, 120) ??
    toNullableTrimmedText(address?.state_district, 120)
  );
}

function buildReverseGeocodeUrl(latitude: number, longitude: number): string {
  const endpoint = (process.env.REVERSE_GEOCODE_ENDPOINT ?? 'https://nominatim.openstreetmap.org/reverse').trim();
  const language = (process.env.REVERSE_GEOCODE_LANG ?? 'en').trim();

  const url = new URL(endpoint);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', latitude.toString());
  url.searchParams.set('lon', longitude.toString());
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '12');
  url.searchParams.set('accept-language', language);
  return url.toString();
}

function buildUserAgent(): string {
  const configured = process.env.REVERSE_GEOCODE_USER_AGENT?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  return 'pikmin-postcard/1.0 (+https://pikmin.askans.app)';
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(buildReverseGeocodeUrl(latitude, longitude), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': buildUserAgent()
      },
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Reverse geocode failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ReverseGeocodeResponse;
    const city = pickCity(payload.address);
    const state = pickState(payload.address);
    const country = toNullableTrimmedText(payload.address?.country, 120);

    if (!city && !state && !country) {
      return null;
    }

    return {
      city,
      state,
      country
    };
  } catch (error) {
    console.error('Reverse geocode lookup failed.', {
      latitude,
      longitude,
      error
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
