import type { TournamentRegion } from './events';

type RegionalHub = {
  region: Exclude<TournamentRegion, 'GLOBAL'>;
  latitude: number;
  longitude: number;
};

// Approximate centers for the Fortnite competitive regions. The user can
// always choose another region manually in the calendar filter.
const regionalHubs: RegionalHub[] = [
  { region: 'EU', latitude: 50.1109, longitude: 8.6821 },
  { region: 'NAE', latitude: 38.9517, longitude: -77.4481 },
  { region: 'NAC', latitude: 32.7767, longitude: -96.797 },
  { region: 'NAW', latitude: 45.5152, longitude: -122.6784 },
  { region: 'BR', latitude: -23.5505, longitude: -46.6333 },
  { region: 'ASIA', latitude: 35.6762, longitude: 139.6503 },
  { region: 'OCE', latitude: -33.8688, longitude: 151.2093 },
  { region: 'ME', latitude: 26.2285, longitude: 50.586 },
];

function distanceInKilometers(
  latitude: number,
  longitude: number,
  hub: RegionalHub,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(hub.latitude - latitude);
  const longitudeDelta = radians(hub.longitude - longitude);
  const startLatitude = radians(latitude);
  const endLatitude = radians(hub.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getNearestTournamentRegion(
  latitude: number,
  longitude: number,
): Exclude<TournamentRegion, 'GLOBAL'> | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return regionalHubs.reduce((nearest, candidate) =>
    distanceInKilometers(latitude, longitude, candidate) <
    distanceInKilometers(latitude, longitude, nearest)
      ? candidate
      : nearest,
  ).region;
}
