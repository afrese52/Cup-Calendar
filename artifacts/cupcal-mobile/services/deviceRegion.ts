import type { LocationPermissionResponse } from 'expo-location';
import { getNearestTournamentRegion } from '../data/regionFromLocation.ts';
import type { TournamentRegion } from '../data/events';

export type DeviceRegionStatus =
  | 'ready'
  | 'permission-required'
  | 'settings-required'
  | 'services-disabled';

export type DeviceRegionResult = {
  status: DeviceRegionStatus;
  permission: LocationPermissionResponse;
  region?: Exclude<TournamentRegion, 'GLOBAL'>;
};

export type RegionPermissionRequest = 'initial' | 'explicit';

type LocationApi = typeof import('expo-location');

export async function resolveDeviceRegion(
  request: RegionPermissionRequest,
  locationApi?: LocationApi,
): Promise<DeviceRegionResult> {
  const location = locationApi ?? (await import('expo-location'));
  let permission = await location.getForegroundPermissionsAsync();

  const shouldAsk =
    !permission.granted &&
    permission.canAskAgain &&
    (request === 'explicit' || permission.status === 'undetermined');
  if (shouldAsk) {
    permission = await location.requestForegroundPermissionsAsync();
  }

  if (!permission.granted) {
    return {
      status: permission.canAskAgain ? 'permission-required' : 'settings-required',
      permission,
    };
  }

  if (!(await location.hasServicesEnabledAsync())) {
    return { status: 'services-disabled', permission };
  }

  const position = await location.getCurrentPositionAsync({
    accuracy: location.Accuracy.Low,
  });
  const region = getNearestTournamentRegion(
    position.coords.latitude,
    position.coords.longitude,
  );

  return region
    ? { status: 'ready', permission, region }
    : { status: 'services-disabled', permission };
}
