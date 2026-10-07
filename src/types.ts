export interface Address {
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
}

export interface Station {
  /** OSM id, e.g. "node/123456" */
  id: string;
  lat: number;
  lon: number;
  name?: string;
  brand?: string;
  operator?: string;
  address: Address;
  openingHours?: string;
  phone?: string;
  website?: string;
}

export interface StationsResponse {
  updatedAt: string;
  stale: boolean;
  count: number;
  stations: Station[];
}
