import AsyncStorage from '@react-native-async-storage/async-storage';

const storage = (AsyncStorage as typeof AsyncStorage & { default?: typeof AsyncStorage }).default
  ?? AsyncStorage;
const BOOKMARKS_KEY = 'cupcal.bookmarks.v2';
const LEGACY_BOOKMARKS_KEY = 'cupcal.bookmarks.v1';

export interface PendingBookmarkChange {
  isFavorite: boolean;
  updatedAt: string;
}

interface AccountBookmarks {
  eventIds: string[];
  pending: Record<string, PendingBookmarkChange>;
  initialized: boolean;
}

interface BookmarkStore {
  anonymousIds: string[];
  anonymousImportDeclinedUserIds: string[];
  accounts: Record<string, AccountBookmarks>;
}

export interface RemoteBookmark {
  event_id: string;
  is_favorite: boolean;
  updated_at: string;
  revision: number;
}

const emptyStore = (): BookmarkStore => ({
  anonymousIds: [],
  anonymousImportDeclinedUserIds: [],
  accounts: {},
});
let bookmarkWriteQueue: Promise<unknown> = Promise.resolve();
const deletedAccountIds = new Set<string>();

function enqueueBookmarkWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = bookmarkWriteQueue.then(operation);
  bookmarkWriteQueue = result.catch(() => undefined);
  return result;
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))];
}

function isPendingChange(value: unknown): value is PendingBookmarkChange {
  if (!value || typeof value !== 'object') return false;
  const change = value as Record<string, unknown>;
  return typeof change.isFavorite === 'boolean' &&
    typeof change.updatedAt === 'string' &&
    Number.isFinite(Date.parse(change.updatedAt));
}

function parseStore(value: unknown): BookmarkStore | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Record<string, unknown>;
  if (!parsed.accounts || typeof parsed.accounts !== 'object') return null;

  const accounts: Record<string, AccountBookmarks> = {};
  for (const [userId, rawAccount] of Object.entries(parsed.accounts)) {
    if (!rawAccount || typeof rawAccount !== 'object') continue;
    const account = rawAccount as Record<string, unknown>;
    const pending: Record<string, PendingBookmarkChange> = {};
    if (account.pending && typeof account.pending === 'object') {
      for (const [eventId, change] of Object.entries(account.pending)) {
        if (isPendingChange(change)) pending[eventId] = change;
      }
    }
    accounts[userId] = {
      eventIds: uniqueIds(account.eventIds),
      pending,
      initialized: account.initialized === true,
    };
  }

  return {
    anonymousIds: uniqueIds(parsed.anonymousIds),
    anonymousImportDeclinedUserIds: uniqueIds(parsed.anonymousImportDeclinedUserIds),
    accounts,
  };
}

async function readStore(): Promise<BookmarkStore> {
  const stored = await storage.getItem(BOOKMARKS_KEY);
  if (stored) {
    try {
      const parsed = parseStore(JSON.parse(stored));
      if (parsed) {
        const legacy = await storage.getItem(LEGACY_BOOKMARKS_KEY);
        if (legacy) {
          try {
            parsed.anonymousIds = uniqueIds([
              ...parsed.anonymousIds,
              ...uniqueIds(JSON.parse(legacy)),
            ]);
          } catch {
            // Keep the current-format data if the legacy value is malformed.
          }
        }
        return parsed;
      }
    } catch {
      // Keep the existing value intact; a later write can replace malformed data.
    }
  }

  const legacy = await storage.getItem(LEGACY_BOOKMARKS_KEY);
  if (!legacy) return emptyStore();
  try {
    const parsedLegacy: unknown = JSON.parse(legacy);
    return {
      anonymousIds: uniqueIds(parsedLegacy),
      anonymousImportDeclinedUserIds: [],
      accounts: {},
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: BookmarkStore): Promise<void> {
  await storage.setItem(BOOKMARKS_KEY, JSON.stringify(store));
  await storage.removeItem(LEGACY_BOOKMARKS_KEY);
}

function accountFor(store: BookmarkStore, userId: string): AccountBookmarks {
  const existing = store.accounts[userId];
  if (existing) return existing;

  return { eventIds: [], pending: {}, initialized: false };
}

function nextTimestamp(account: AccountBookmarks): string {
  const newest = Object.values(account.pending).reduce(
    (latest, change) => Math.max(latest, Date.parse(change.updatedAt)),
    0,
  );
  return new Date(Math.max(Date.now(), newest + 1)).toISOString();
}

function remoteAcknowledgesChange(
  remote: RemoteBookmark,
  change: PendingBookmarkChange,
): boolean {
  // The device timestamp is only diagnostic metadata. A matching value already
  // on the server means this desired state has been reached, regardless of
  // which device's clock was ahead.
  return remote.is_favorite === change.isFavorite;
}

export function shouldUploadBookmarkChange(
  change: PendingBookmarkChange,
  remote: RemoteBookmark | undefined,
): boolean {
  // Server revisions are allocated by the RPC in arrival order. Never use a
  // device clock to reject a still-pending change.
  return !remote || remote.is_favorite !== change.isFavorite;
}

export async function loadAnonymousBookmarks(): Promise<string[]> {
  const store = await readStore();
  return [...store.anonymousIds];
}

export async function getAnonymousBookmarksForImport(userId: string): Promise<string[]> {
  if (deletedAccountIds.has(userId)) return [];
  const store = await readStore();
  if (store.anonymousImportDeclinedUserIds.includes(userId)) return [];
  return [...store.anonymousIds];
}

export async function loadBookmarksForUser(userId: string | null): Promise<string[]> {
  if (userId && deletedAccountIds.has(userId)) return [];
  const store = await readStore();
  return userId
    ? [...(store.accounts[userId]?.eventIds ?? [])]
    : [...store.anonymousIds];
}

export async function removeBookmarksForDeletedUser(userId: string): Promise<void> {
  if (!userId) return;
  deletedAccountIds.add(userId);
  return enqueueBookmarkWrite(async () => {
    const store = await readStore();
    delete store.accounts[userId];
    store.anonymousImportDeclinedUserIds = store.anonymousImportDeclinedUserIds
      .filter((declinedUserId) => declinedUserId !== userId);
    await writeStore(store);
  });
}

export async function importAnonymousBookmarksForUser(userId: string): Promise<string[]> {
  return enqueueBookmarkWrite(async () => {
    if (deletedAccountIds.has(userId)) return [];
    const store = await readStore();
    const account = accountFor(store, userId);
    for (const eventId of store.anonymousIds) {
      if (account.pending[eventId]?.isFavorite === false) continue;
      account.eventIds = uniqueIds([...account.eventIds, eventId]);
      if (!account.pending[eventId]) {
        account.pending[eventId] = { isFavorite: true, updatedAt: nextTimestamp(account) };
      }
    }
    store.accounts[userId] = account;
    store.anonymousIds = [];
    await writeStore(store);
    return [...account.eventIds];
  });
}

export async function keepAnonymousBookmarksLocal(userId: string): Promise<void> {
  return enqueueBookmarkWrite(async () => {
    if (deletedAccountIds.has(userId)) return;
    const store = await readStore();
    store.anonymousImportDeclinedUserIds = uniqueIds([
      ...store.anonymousImportDeclinedUserIds,
      userId,
    ]);
    await writeStore(store);
  });
}

export async function setBookmarksFavorite(
  userId: string | null,
  eventIds: string[],
  isFavorite: boolean,
): Promise<string[]> {
  return enqueueBookmarkWrite(async () => {
    if (userId && deletedAccountIds.has(userId)) return [];
    if (!userId && isFavorite) {
      throw new Error('Zum Speichern von Terminen musst du angemeldet sein.');
    }
    const store = await readStore();
    const ids = uniqueIds(eventIds);
    if (!userId) {
      const next = new Set(store.anonymousIds);
      for (const eventId of ids) {
        if (isFavorite) next.add(eventId);
        else next.delete(eventId);
      }
      store.anonymousIds = [...next];
    } else {
      const account = accountFor(store, userId);
      const next = new Set(account.eventIds);
      for (const eventId of ids) {
        if (isFavorite) next.add(eventId);
        else next.delete(eventId);
        account.pending[eventId] = {
          isFavorite,
          updatedAt: nextTimestamp(account),
        };
      }
      account.eventIds = [...next];
      store.accounts[userId] = account;
    }
    await writeStore(store);
    return userId ? [...store.accounts[userId].eventIds] : [...store.anonymousIds];
  });
}

export async function prepareBookmarksForSync(
  userId: string,
): Promise<Record<string, PendingBookmarkChange>> {
  return enqueueBookmarkWrite(async () => {
    if (deletedAccountIds.has(userId)) return {};
    const store = await readStore();
    const account = accountFor(store, userId);
    if (!account.initialized) {
      for (const eventId of account.eventIds) {
        if (!account.pending[eventId]) {
          account.pending[eventId] = { isFavorite: true, updatedAt: nextTimestamp(account) };
        }
      }
    }
    store.accounts[userId] = account;
    await writeStore(store);
    return { ...account.pending };
  });
}

export async function reconcileBookmarks(
  userId: string,
  remoteBookmarks: RemoteBookmark[],
): Promise<{ eventIds: string[]; pendingCount: number }> {
  return enqueueBookmarkWrite(async () => {
    if (deletedAccountIds.has(userId)) return { eventIds: [], pendingCount: 0 };
    const store = await readStore();
    const account = accountFor(store, userId);
    const remoteById = new Map(remoteBookmarks.map((bookmark) => [bookmark.event_id, bookmark]));

    for (const [eventId, change] of Object.entries(account.pending)) {
      const remote = remoteById.get(eventId);
      if (remote && remoteAcknowledgesChange(remote, change)) {
        delete account.pending[eventId];
      }
    }

    const favorites = new Set(
      remoteBookmarks.filter((bookmark) => bookmark.is_favorite).map((bookmark) => bookmark.event_id),
    );
    for (const [eventId, change] of Object.entries(account.pending)) {
      if (change.isFavorite) favorites.add(eventId);
      else favorites.delete(eventId);
    }

    account.eventIds = [...favorites];
    account.initialized = true;
    store.accounts[userId] = account;
    await writeStore(store);
    return { eventIds: account.eventIds, pendingCount: Object.keys(account.pending).length };
  });
}
