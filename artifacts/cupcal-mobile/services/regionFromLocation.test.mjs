import assert from 'node:assert/strict';
import test from 'node:test';
import { getNearestTournamentRegion } from '../data/regionFromLocation.ts';

test('ordnet bekannte Gerätepositionen der nächstgelegenen Fortnite-Region zu', () => {
  const locations = [
    [52.52, 13.405, 'EU'],
    [40.7128, -74.006, 'NAE'],
    [32.7767, -96.797, 'NAC'],
    [45.5152, -122.6784, 'NAW'],
    [-23.5505, -46.6333, 'BR'],
    [35.6762, 139.6503, 'ASIA'],
    [-33.8688, 151.2093, 'OCE'],
    [26.2285, 50.586, 'ME'],
  ];

  for (const [latitude, longitude, expected] of locations) {
    assert.equal(getNearestTournamentRegion(latitude, longitude), expected);
  }
});

test('lehnt ungültige Koordinaten ab', () => {
  assert.equal(getNearestTournamentRegion(Number.NaN, 0), null);
  assert.equal(getNearestTournamentRegion(91, 0), null);
  assert.equal(getNearestTournamentRegion(0, -181), null);
});
