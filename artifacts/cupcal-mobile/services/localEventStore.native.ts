import { openDatabaseAsync } from 'expo-sqlite';
import { createLocalEventStore } from './localEventStoreCore';

const localEventStore = createLocalEventStore(openDatabaseAsync);

export const loadCachedEvents = localEventStore.loadCachedEvents;
export const saveEventsToCache = localEventStore.saveEventsToCache;
