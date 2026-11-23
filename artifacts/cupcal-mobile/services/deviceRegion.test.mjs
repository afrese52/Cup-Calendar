import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeviceRegion } from './deviceRegion.ts';

function permission(status, canAskAgain) {
  return {
    status,
    granted: status === 'granted',
    canAskAgain,
    expires: 'never',
  };
}

function makeLocationApi({
  currentPermission = permission('granted', true),
  requestedPermission = permission('granted', true),
  servicesEnabled = true,
  coordinates = { latitude: 52.52, longitude: 13.405 },
} = {}) {
  const calls = { requests: 0, positionOptions: null };
  const api = {
    Accuracy: { Low: 2 },
    getForegroundPermissionsAsync: async () => currentPermission,
    requestForegroundPermissionsAsync: async () => {
      calls.requests += 1;
      return requestedPermission;
    },
    hasServicesEnabledAsync: async () => servicesEnabled,
    getCurrentPositionAsync: async (options) => {
      calls.positionOptions = options;
      return { coords: coordinates };
    },
  };
  return { api, calls };
}

test('fragt beim ersten automatischen Ermitteln um Erlaubnis und liefert nur den Regionscode', async () => {
  const { api, calls } = makeLocationApi({
    currentPermission: permission('undetermined', true),
  });

  const result = await resolveDeviceRegion('initial', api);

  assert.equal(result.status, 'ready');
  assert.equal(result.region, 'EU');
  assert.equal(calls.requests, 1);
  assert.deepEqual(calls.positionOptions, { accuracy: 2 });
  assert.equal('coords' in result, false);
});

test('fragt nach einer zuvor abgelehnten Freigabe nicht automatisch erneut', async () => {
  const { api, calls } = makeLocationApi({
    currentPermission: permission('denied', true),
  });

  const result = await resolveDeviceRegion('initial', api);

  assert.equal(result.status, 'permission-required');
  assert.equal(calls.requests, 0);
});

test('erlaubt einen neuen Freigabeversuch nach ausdrücklichem Antippen', async () => {
  const { api, calls } = makeLocationApi({
    currentPermission: permission('denied', true),
  });

  const result = await resolveDeviceRegion('explicit', api);

  assert.equal(result.status, 'ready');
  assert.equal(calls.requests, 1);
});

test('fordert bei dauerhaft abgelehnter Freigabe zum Öffnen der Einstellungen auf', async () => {
  const { api, calls } = makeLocationApi({
    currentPermission: permission('denied', false),
  });

  const result = await resolveDeviceRegion('explicit', api);

  assert.equal(result.status, 'settings-required');
  assert.equal(calls.requests, 0);
});

test('meldet deaktivierte Standortdienste ohne Koordinaten weiterzuverarbeiten', async () => {
  const { api } = makeLocationApi({ servicesEnabled: false });

  const result = await resolveDeviceRegion('initial', api);

  assert.equal(result.status, 'services-disabled');
  assert.equal(result.region, undefined);
});
