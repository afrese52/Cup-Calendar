import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireConfiguration() {
  const missing = [
    !supabaseUrl && "SUPABASE_URL",
    !anonKey && "SUPABASE_ANON_KEY",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  assert.deepEqual(
    missing,
    [],
    `Für den Isolationstest müssen folgende Variablen gesetzt sein: ${missing.join(", ")}`,
  );
}

async function waitForSignal(signal, message) {
  let timeout;
  try {
    return await Promise.race([
      signal,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function assertNoSignal(signal, message, duration = 2_000) {
  let timeout;
  try {
    const received = await Promise.race([
      signal,
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(null), duration);
      }),
    ]);
    assert.equal(received, null, message);
  } finally {
    clearTimeout(timeout);
  }
}

async function createTestAccount(admin, label, accounts) {
  const email = `cupcal-isolation-${randomUUID()}@example.com`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { cupcal_isolation_test: label },
  });
  assert.ifError(error);
  assert.ok(data.user, `Testkonto ${label} wurde nicht angelegt.`);

  const account = { id: data.user.id, client: null, email, password, deleted: false };
  accounts.push(account);
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signIn.error);
  assert.equal(signIn.data.user?.id, data.user.id);
  account.client = client;
  return account;
}

async function withTestAccounts(run) {
  requireConfiguration();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const schema = await admin
    .from("user_event_bookmarks")
    .select("user_id, event_id, is_favorite, updated_at, revision")
    .limit(0);
  if (["42703", "PGRST204", "PGRST205"].includes(schema.error?.code)) {
    throw new Error(
      "Die Bookmark-Tabelle ist nicht aktuell. Führe die Migrationen 0002 und 0003 aus.",
    );
  }
  assert.ifError(schema.error);

  const accounts = [];
  try {
    await createTestAccount(admin, "A", accounts);
    await createTestAccount(admin, "B", accounts);
    await run(accounts[0], accounts[1]);
  } finally {
    const cleanupResults = await Promise.all(
      accounts
        .filter(({ deleted }) => !deleted)
        .map(({ id }) => admin.auth.admin.deleteUser(id)),
    );
    for (const result of cleanupResults) assert.ifError(result.error);
  }
}

test("anonyme RPC-Aufrufe können Favoriten weder anlegen noch ändern", async () => {
  await withTestAccounts(async (account) => {
    const anonymousClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const newEventId = `anonymous-rpc-new-${randomUUID()}`;
    const existingEventId = `anonymous-rpc-existing-${randomUUID()}`;
    const updatedAt = new Date(0).toISOString();

    const seed = await account.client.rpc("sync_user_event_bookmark", {
      p_event_id: existingEventId,
      p_is_favorite: true,
      p_updated_at: updatedAt,
    });
    assert.ifError(seed.error);

    for (const eventId of [newEventId, existingEventId]) {
      const result = await anonymousClient.rpc("sync_user_event_bookmark", {
        p_event_id: eventId,
        p_is_favorite: false,
        p_updated_at: updatedAt,
      });
      assert.ok(
        result.error,
        "Ein nicht angemeldeter Client darf die Favoriten-RPC nicht aufrufen.",
      );
    }

    const savedRows = await admin
      .from("user_event_bookmarks")
      .select("event_id, is_favorite, revision")
      .in("event_id", [newEventId, existingEventId]);
    assert.ifError(savedRows.error);
    assert.deepEqual(
      savedRows.data,
      [{ event_id: existingEventId, is_favorite: true, revision: 1 }],
      "Anonyme Aufrufe dürfen keine Favoritenzeile erzeugen oder verändern.",
    );
  });
});

test("anonyme Tabellenzugriffe können Favoriten weder lesen, schreiben noch löschen", async () => {
  await withTestAccounts(async (account) => {
    const anonymousClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const existingEventId = `anonymous-table-existing-${randomUUID()}`;
    const newEventId = `anonymous-table-new-${randomUUID()}`;

    const seed = await account.client.from("user_event_bookmarks").insert({
      user_id: account.id,
      event_id: existingEventId,
      is_favorite: true,
    });
    assert.ifError(seed.error);

    const read = await anonymousClient
      .from("user_event_bookmarks")
      .select("user_id, event_id, is_favorite")
      .eq("user_id", account.id)
      .eq("event_id", existingEventId);
    assert.deepEqual(
      read.data ?? [],
      [],
      "Ein anonymer Client darf vorhandene Favoriten nicht lesen.",
    );

    const insert = await anonymousClient.from("user_event_bookmarks").insert({
      user_id: account.id,
      event_id: newEventId,
      is_favorite: true,
    });
    assert.ok(insert.error, "Ein anonymer Client darf keine Favoriten einfügen.");

    const update = await anonymousClient
      .from("user_event_bookmarks")
      .update({ is_favorite: false })
      .eq("user_id", account.id)
      .eq("event_id", existingEventId)
      .select("event_id");
    assert.ok(
      update.error || update.data?.length === 0,
      "Ein anonymer Client darf keine Favoriten ändern.",
    );

    const deletion = await anonymousClient
      .from("user_event_bookmarks")
      .delete()
      .eq("user_id", account.id)
      .eq("event_id", existingEventId)
      .select("event_id");
    assert.ok(
      deletion.error || deletion.data?.length === 0,
      "Ein anonymer Client darf keine Favoriten löschen.",
    );

    const savedRows = await admin
      .from("user_event_bookmarks")
      .select("user_id, event_id, is_favorite, revision")
      .in("event_id", [existingEventId, newEventId])
      .order("event_id");
    assert.ifError(savedRows.error);
    assert.deepEqual(
      savedRows.data,
      [{
        user_id: account.id,
        event_id: existingEventId,
        is_favorite: true,
        revision: 0,
      }],
      "Anonyme Tabellenzugriffe dürfen keine Favoriten lesen, ändern oder löschen.",
    );
  });
});

test("Supabase-RLS trennt Favoriten-Lese- und Schreibzugriffe", async () => {
  await withTestAccounts(async (accountA, accountB) => {
    const eventA = `isolation-a-${randomUUID()}`;
    const eventB = `isolation-b-${randomUUID()}`;

    for (const [account, eventId] of [
      [accountA, eventA],
      [accountB, eventB],
    ]) {
      const { error } = await account.client.from("user_event_bookmarks").insert({
        user_id: account.id,
        event_id: eventId,
        is_favorite: true,
      });
      assert.ifError(error);
    }

    const ownA = await accountA.client
      .from("user_event_bookmarks")
      .select("event_id, is_favorite")
      .eq("user_id", accountA.id);
    const ownB = await accountB.client
      .from("user_event_bookmarks")
      .select("event_id, is_favorite")
      .eq("user_id", accountB.id);
    assert.ifError(ownA.error);
    assert.ifError(ownB.error);
    assert.deepEqual(ownA.data?.map(({ event_id }) => event_id), [eventA]);
    assert.deepEqual(ownB.data?.map(({ event_id }) => event_id), [eventB]);

    const foreignReadA = await accountA.client
      .from("user_event_bookmarks")
      .select("event_id")
      .eq("user_id", accountB.id);
    const foreignReadB = await accountB.client
      .from("user_event_bookmarks")
      .select("event_id")
      .eq("user_id", accountA.id);
    assert.ifError(foreignReadA.error);
    assert.ifError(foreignReadB.error);
    assert.deepEqual(foreignReadA.data, []);
    assert.deepEqual(foreignReadB.data, []);

    const forgedInsert = await accountA.client
      .from("user_event_bookmarks")
      .insert({
        user_id: accountB.id,
        event_id: `forged-${randomUUID()}`,
        is_favorite: true,
      });
    assert.ok(forgedInsert.error, "Fremde Konto-ID beim Einfügen wurde akzeptiert.");

    const foreignUpdate = await accountA.client
      .from("user_event_bookmarks")
      .update({ is_favorite: false })
      .eq("user_id", accountB.id)
      .eq("event_id", eventB)
      .select("event_id");
    assert.ifError(foreignUpdate.error);
    assert.deepEqual(foreignUpdate.data, []);
  });
});

test("Supabase-RLS verhindert die Übertragung eines Favoriten auf ein anderes Konto", async () => {
  await withTestAccounts(async (accountA, accountB) => {
    const eventA = `owner-transfer-a-${randomUUID()}`;
    const eventB = `owner-transfer-b-${randomUUID()}`;

    const [insertA, insertB] = await Promise.all([
      accountA.client.from("user_event_bookmarks").insert({
        user_id: accountA.id,
        event_id: eventA,
        is_favorite: true,
      }),
      accountB.client.from("user_event_bookmarks").insert({
        user_id: accountB.id,
        event_id: eventB,
        is_favorite: false,
      }),
    ]);
    assert.ifError(insertA.error);
    assert.ifError(insertB.error);

    const transfer = await accountA.client
      .from("user_event_bookmarks")
      .update({ user_id: accountB.id })
      .eq("user_id", accountA.id)
      .eq("event_id", eventA)
      .select("user_id, event_id");
    assert.ok(
      transfer.error || transfer.data?.length === 0,
      "Ein angemeldetes Konto darf den Favoriten nicht einem anderen Konto zuordnen.",
    );

    const [rowsA, rowsB] = await Promise.all([
      accountA.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("user_id", accountA.id),
      accountB.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("user_id", accountB.id),
    ]);
    assert.ifError(rowsA.error);
    assert.ifError(rowsB.error);
    assert.deepEqual(rowsA.data, [{
      user_id: accountA.id,
      event_id: eventA,
      is_favorite: true,
      revision: 0,
    }], "Konto A muss Status und Revision seines Favoriten behalten.");
    assert.deepEqual(rowsB.data, [{
      user_id: accountB.id,
      event_id: eventB,
      is_favorite: false,
      revision: 0,
    }], "Konto B muss Status und Revision seines Favoriten behalten.");
  });
});

test("RPC schützt Konten und synchronisiert eine zweite Gerätesitzung", async () => {
  await withTestAccounts(async (accountA, accountB) => {
    const eventA = `rpc-a-${randomUUID()}`;
    const eventB = `rpc-b-${randomUUID()}`;
    const updatedAt = new Date(0).toISOString();
    const sync = async (client, eventId, isFavorite) => {
      const result = await client.rpc("sync_user_event_bookmark", {
        p_event_id: eventId,
        p_is_favorite: isFavorite,
        p_updated_at: updatedAt,
      });
      if (result.error?.code === "PGRST202") {
        throw new Error(
          "Supabase-RPC fehlt. Führe zuerst die Bookmark-Migrationen 0002 und 0003 aus.",
        );
      }
      return result;
    };

    const secondDevice = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const secondDeviceSignIn = await secondDevice.auth.signInWithPassword({
      email: accountA.email,
      password: accountA.password,
    });
    assert.ifError(secondDeviceSignIn.error);
    assert.equal(secondDeviceSignIn.data.user?.id, accountA.id);

    const anonymousClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let resolveSubscribed;
    let rejectSubscription;
    const subscribed = new Promise((resolve, reject) => {
      resolveSubscribed = resolve;
      rejectSubscription = reject;
    });
    let resolveRealtimeChange;
    const realtimeChange = new Promise((resolve) => {
      resolveRealtimeChange = resolve;
    });
    let resolveAnonymousSubscribed;
    let rejectAnonymousSubscription;
    const anonymousSubscribed = new Promise((resolve, reject) => {
      resolveAnonymousSubscribed = resolve;
      rejectAnonymousSubscription = reject;
    });
    let resolveAnonymousChange;
    const anonymousRealtimeChange = new Promise((resolve) => {
      resolveAnonymousChange = resolve;
    });
    let resolveForeignAccountChange;
    const foreignAccountRealtimeChange = new Promise((resolve) => {
      resolveForeignAccountChange = resolve;
    });
    let resolveAccountASubscribed;
    let rejectAccountASubscription;
    const accountASubscribed = new Promise((resolve, reject) => {
      resolveAccountASubscribed = resolve;
      rejectAccountASubscription = reject;
    });
    const realtimeEventId = `same-account-device-${randomUUID()}`;
    const foreignAccountEventId = `other-account-realtime-${randomUUID()}`;
    const realtimeChannel = secondDevice
      .channel(`bookmark-sync-test-${randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_event_bookmarks",
          filter: `user_id=eq.${accountA.id}`,
        },
        (payload) => {
          if (payload.new?.event_id === realtimeEventId) {
            resolveRealtimeChange(payload);
          }
        },
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolveSubscribed();
        if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          rejectSubscription(error ?? new Error(`Realtime-Status: ${status}`));
        }
      });
    const anonymousRealtimeChannel = anonymousClient
      .channel(`anonymous-bookmark-test-${randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_event_bookmarks",
          filter: `user_id=eq.${accountA.id}`,
        },
        (payload) => {
          if (payload.new?.event_id === realtimeEventId) {
            resolveAnonymousChange(payload);
          }
        },
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolveAnonymousSubscribed();
        if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          rejectAnonymousSubscription(
            error ?? new Error(`Anonymer Realtime-Status: ${status}`),
          );
        }
      });
    const accountARealtimeChannel = accountA.client
      .channel(`account-a-bookmark-test-${randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_event_bookmarks",
          filter: `user_id=eq.${accountA.id}`,
        },
        (payload) => {
          if (payload.new?.event_id === foreignAccountEventId) {
            resolveForeignAccountChange(payload);
          }
        },
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolveAccountASubscribed();
        if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          rejectAccountASubscription(
            error ?? new Error(`Konto-A-Realtime-Status: ${status}`),
          );
        }
      });

    try {
      await Promise.all([
        waitForSignal(
          subscribed,
          "Zweites Gerät konnte Realtime nicht abonnieren. Prüfe Migration 0004.",
        ),
        waitForSignal(
          anonymousSubscribed,
          "Anonymer Client konnte Realtime nicht abonnieren.",
        ),
        waitForSignal(
          accountASubscribed,
          "Konto A konnte Realtime nicht abonnieren.",
        ),
      ]);
      const realtimeSync = await sync(accountA.client, realtimeEventId, true);
      assert.ifError(realtimeSync.error);
      const received = await waitForSignal(
        realtimeChange,
        "Zweites Gerät erhielt keine Favoritenänderung. Prüfe Migration 0004.",
      );
      assert.equal(received.new.user_id, accountA.id);
      assert.equal(received.new.is_favorite, true);
      await assertNoSignal(
        anonymousRealtimeChange,
        "Anonymer Client erhielt eine Favoritenänderung.",
      );

      const foreignAccountSync = await sync(accountB.client, foreignAccountEventId, true);
      assert.ifError(foreignAccountSync.error);
      await assertNoSignal(
        foreignAccountRealtimeChange,
        "Konto A erhielt eine Favoritenänderung von Konto B.",
      );

      const fromSecondDevice = await secondDevice
        .from("user_event_bookmarks")
        .select("is_favorite")
        .eq("user_id", accountA.id)
        .eq("event_id", realtimeEventId)
        .single();
      assert.ifError(fromSecondDevice.error);
      assert.equal(fromSecondDevice.data?.is_favorite, true);
    } finally {
      await Promise.all([
        secondDevice.removeChannel(realtimeChannel),
        anonymousClient.removeChannel(anonymousRealtimeChannel),
        accountA.client.removeChannel(accountARealtimeChannel),
      ]);
    }

    const firstSyncA = await sync(accountA.client, eventA, true);
    const firstSyncB = await sync(accountB.client, eventB, true);
    assert.ifError(firstSyncA.error);
    assert.ifError(firstSyncB.error);

    const crossAccountSync = await sync(accountA.client, eventB, false);
    assert.ifError(crossAccountSync.error);

    const verifyB = await accountB.client
      .from("user_event_bookmarks")
      .select("is_favorite, revision")
      .eq("user_id", accountB.id)
      .eq("event_id", eventB)
      .single();
    assert.ifError(verifyB.error);
    assert.equal(verifyB.data?.is_favorite, true);
    assert.equal(verifyB.data?.revision, 1);

    const secondSyncA = await sync(accountA.client, eventA, false);
    assert.ifError(secondSyncA.error);
    const verifyA = await accountA.client
      .from("user_event_bookmarks")
      .select("is_favorite, revision")
      .eq("user_id", accountA.id)
      .eq("event_id", eventA)
      .single();
    assert.ifError(verifyA.error);
    assert.equal(verifyA.data?.is_favorite, false);
    assert.equal(verifyA.data?.revision, 2);
  });
});

test("spätere RPC-Aufrufe ändern beim gemeinsamen Termin nur das eigene Konto", async () => {
  await withTestAccounts(async (accountA, accountB) => {
    const eventId = `shared-event-${randomUUID()}`;
    const updatedAt = new Date(0).toISOString();
    const [syncA, syncB] = await Promise.all([
      accountA.client.rpc("sync_user_event_bookmark", {
        p_event_id: eventId,
        p_is_favorite: true,
        p_updated_at: updatedAt,
      }),
      accountB.client.rpc("sync_user_event_bookmark", {
        p_event_id: eventId,
        p_is_favorite: false,
        p_updated_at: updatedAt,
      }),
    ]);

    assert.ifError(syncA.error);
    assert.ifError(syncB.error);

    const [savedA, savedB] = await Promise.all([
      accountA.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("event_id", eventId)
        .single(),
      accountB.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("event_id", eventId)
        .single(),
    ]);

    assert.ifError(savedA.error);
    assert.ifError(savedB.error);
    const initialStateA = {
      user_id: accountA.id,
      event_id: eventId,
      is_favorite: true,
      revision: 1,
    };
    const initialStateB = {
      user_id: accountB.id,
      event_id: eventId,
      is_favorite: false,
      revision: 1,
    };
    assert.deepEqual(savedA.data, initialStateA);
    assert.deepEqual(savedB.data, initialStateB);

    const updateA = await accountA.client.rpc("sync_user_event_bookmark", {
      p_event_id: eventId,
      p_is_favorite: false,
      p_updated_at: updatedAt,
    });
    assert.ifError(updateA.error);

    const [afterUpdateA, unchangedB] = await Promise.all([
      accountA.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("event_id", eventId)
        .single(),
      accountB.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("event_id", eventId)
        .single(),
    ]);
    assert.ifError(afterUpdateA.error);
    assert.ifError(unchangedB.error);
    assert.deepEqual(afterUpdateA.data, { ...initialStateA, is_favorite: false, revision: 2 });
    assert.deepEqual(unchangedB.data, initialStateB);

    const updateB = await accountB.client.rpc("sync_user_event_bookmark", {
      p_event_id: eventId,
      p_is_favorite: true,
      p_updated_at: updatedAt,
    });
    assert.ifError(updateB.error);

    const [unchangedA, afterUpdateB] = await Promise.all([
      accountA.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("event_id", eventId)
        .single(),
      accountB.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("event_id", eventId)
        .single(),
    ]);
    assert.ifError(unchangedA.error);
    assert.ifError(afterUpdateB.error);
    assert.deepEqual(unchangedA.data, { ...initialStateA, is_favorite: false, revision: 2 });
    assert.deepEqual(afterUpdateB.data, { ...initialStateB, is_favorite: true, revision: 2 });
  });
});

test("gleichzeitige RPC-Aufrufe ändern bestehende gemeinsame Favoriten getrennt", async () => {
  await withTestAccounts(async (accountA, accountB) => {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const eventId = `parallel-shared-update-${randomUUID()}`;
    const updatedAt = new Date(0).toISOString();
    const sync = (account, isFavorite) => account.client.rpc(
      "sync_user_event_bookmark",
      {
        p_event_id: eventId,
        p_is_favorite: isFavorite,
        p_updated_at: updatedAt,
      },
    );

    const [initialA, initialB] = await Promise.all([
      sync(accountA, true),
      sync(accountB, false),
    ]);
    assert.ifError(initialA.error);
    assert.ifError(initialB.error);

    const [updateA, updateB] = await Promise.all([
      sync(accountA, false),
      sync(accountB, true),
    ]);
    assert.ifError(updateA.error);
    assert.ifError(updateB.error);

    const savedRows = await admin
      .from("user_event_bookmarks")
      .select("user_id, event_id, is_favorite, revision")
      .eq("event_id", eventId)
      .order("user_id");
    assert.ifError(savedRows.error);
    assert.equal(savedRows.data?.length, 2, "Für den Termin müssen zwei Kontenzeilen bestehen bleiben.");
    const savedByAccount = new Map(
      savedRows.data?.map((row) => [row.user_id, row]) ?? [],
    );
    assert.deepEqual(
      savedByAccount.get(accountA.id),
      {
        user_id: accountA.id,
        event_id: eventId,
        is_favorite: false,
        revision: 2,
      },
      "Konto A muss seinen zuletzt gesetzten Status und eine eigene neue Revision behalten.",
    );
    assert.deepEqual(
      savedByAccount.get(accountB.id),
      {
        user_id: accountB.id,
        event_id: eventId,
        is_favorite: true,
        revision: 2,
      },
      "Beide Konten müssen ihren zuletzt gesetzten Status und eine eigene neue Revision behalten.",
    );
  });
});

test("Kontolöschung entfernt beim gemeinsamen Termin nur die eigene Favoritenzeile", async () => {
  await withTestAccounts(async (accountA, accountB) => {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const eventId = `shared-delete-event-${randomUUID()}`;
    const updatedAt = new Date(0).toISOString();
    const [syncA, syncB] = await Promise.all([
      accountA.client.rpc("sync_user_event_bookmark", {
        p_event_id: eventId,
        p_is_favorite: true,
        p_updated_at: updatedAt,
      }),
      accountB.client.rpc("sync_user_event_bookmark", {
        p_event_id: eventId,
        p_is_favorite: false,
        p_updated_at: updatedAt,
      }),
    ]);
    assert.ifError(syncA.error);
    assert.ifError(syncB.error);

    const deletion = await admin.auth.admin.deleteUser(accountA.id);
    assert.ifError(deletion.error);
    accountA.deleted = true;

    const remainingRows = await admin
      .from("user_event_bookmarks")
      .select("user_id, event_id, is_favorite, revision")
      .eq("event_id", eventId)
      .order("user_id");
    assert.ifError(remainingRows.error);
    assert.deepEqual(
      remainingRows.data,
      [{
        user_id: accountB.id,
        event_id: eventId,
        is_favorite: false,
        revision: 1,
      }],
      "Beim Löschen eines Kontos muss die Zeile des anderen Kontos unverändert bleiben.",
    );
  });
});

test("RLS blockiert direkte fremde Änderungen bei gleicher Termin-ID", async () => {
  await withTestAccounts(async (accountA, accountB) => {
    const eventId = `shared-direct-event-${randomUUID()}`;
    const updatedAt = new Date(0).toISOString();
    const [seedA, seedB] = await Promise.all([
      accountA.client.rpc("sync_user_event_bookmark", {
        p_event_id: eventId,
        p_is_favorite: true,
        p_updated_at: updatedAt,
      }),
      accountB.client.rpc("sync_user_event_bookmark", {
        p_event_id: eventId,
        p_is_favorite: false,
        p_updated_at: updatedAt,
      }),
    ]);
    assert.ifError(seedA.error);
    assert.ifError(seedB.error);

    const [updateA, updateB] = await Promise.all([
      accountA.client
        .from("user_event_bookmarks")
        .update({ is_favorite: false })
        .eq("user_id", accountB.id)
        .eq("event_id", eventId)
        .select("event_id"),
      accountB.client
        .from("user_event_bookmarks")
        .update({ is_favorite: true })
        .eq("user_id", accountA.id)
        .eq("event_id", eventId)
        .select("event_id"),
    ]);
    assert.ifError(updateA.error);
    assert.ifError(updateB.error);
    assert.deepEqual(updateA.data, [], "Konto A darf die Zeile von Konto B nicht ändern.");
    assert.deepEqual(updateB.data, [], "Konto B darf die Zeile von Konto A nicht ändern.");

    const [insertA, insertB] = await Promise.all([
      accountA.client.from("user_event_bookmarks").insert({
        user_id: accountB.id,
        event_id: eventId,
        is_favorite: true,
      }),
      accountB.client.from("user_event_bookmarks").insert({
        user_id: accountA.id,
        event_id: eventId,
        is_favorite: false,
      }),
    ]);
    assert.ok(insertA.error, "Konto A darf keine fremde Zeile für den gemeinsamen Termin einfügen.");
    assert.ok(insertB.error, "Konto B darf keine fremde Zeile für den gemeinsamen Termin einfügen.");

    const [savedA, savedB] = await Promise.all([
      accountA.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("event_id", eventId)
        .single(),
      accountB.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("event_id", eventId)
        .single(),
    ]);
    assert.ifError(savedA.error);
    assert.ifError(savedB.error);
    assert.deepEqual(savedA.data, {
      user_id: accountA.id,
      event_id: eventId,
      is_favorite: true,
      revision: 1,
    });
    assert.deepEqual(savedB.data, {
      user_id: accountB.id,
      event_id: eventId,
      is_favorite: false,
      revision: 1,
    });
  });
});

test("RLS blockiert Upserts auf vorhandene Favoriten eines fremden Kontos", async () => {
  await withTestAccounts(async (accountA, accountB) => {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const eventId = `shared-upsert-event-${randomUUID()}`;
    const originalState = {
      user_id: accountB.id,
      event_id: eventId,
      is_favorite: true,
      revision: 0,
    };

    const seed = await accountB.client
      .from("user_event_bookmarks")
      .insert(originalState);
    assert.ifError(seed.error);

    const attemptedUpsert = await accountA.client
      .from("user_event_bookmarks")
      .upsert(
        {
          user_id: accountB.id,
          event_id: eventId,
          is_favorite: false,
          revision: 99,
        },
        { onConflict: "user_id,event_id" },
      )
      .select("user_id, event_id, is_favorite, revision");
    assert.ok(
      attemptedUpsert.error,
      "Konto A darf einen vorhandenen Favoriten von Konto B nicht per Upsert ändern.",
    );

    const [visibleToB, visibleToAdmin] = await Promise.all([
      accountB.client
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("user_id", accountB.id)
        .eq("event_id", eventId)
        .single(),
      admin
        .from("user_event_bookmarks")
        .select("user_id, event_id, is_favorite, revision")
        .eq("user_id", accountB.id)
        .eq("event_id", eventId)
        .single(),
    ]);
    assert.ifError(visibleToB.error);
    assert.ifError(visibleToAdmin.error);
    assert.deepEqual(
      visibleToB.data,
      originalState,
      "Konto B muss seinen ursprünglichen Favoritenzustand behalten.",
    );
    assert.deepEqual(
      visibleToAdmin.data,
      originalState,
      "Der privilegierte Prüfclient muss den ursprünglichen Zustand bestätigen.",
    );
  });
});

test("gleichzeitige RPC-Aufrufe erhöhen die Revision atomar und behalten den zuletzt angenommenen Status", async () => {
  await withTestAccounts(async (accountA) => {
    const secondDevice = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const secondDeviceSignIn = await secondDevice.auth.signInWithPassword({
      email: accountA.email,
      password: accountA.password,
    });
    assert.ifError(secondDeviceSignIn.error);
    assert.equal(secondDeviceSignIn.data.user?.id, accountA.id);

    const eventId = `parallel-rpc-${randomUUID()}`;
    const operationCount = 12;
    const sync = async (client, isFavorite) => client.rpc(
      "sync_user_event_bookmark",
      {
        p_event_id: eventId,
        p_is_favorite: isFavorite,
        // Identische, absichtlich alte Gerätezeitstempel dürfen die
        // serverseitige Reihenfolge nicht beeinflussen.
        p_updated_at: new Date(0).toISOString(),
      },
    );
    const requests = Array.from({ length: operationCount }, (_, index) => {
      const client = index % 2 === 0 ? accountA.client : secondDevice;
      return sync(client, index % 2 === 0);
    });
    const results = await Promise.all(requests);
    for (const result of results) assert.ifError(result.error);

    const parallelState = await accountA.client
      .from("user_event_bookmarks")
      .select("is_favorite, revision")
      .eq("user_id", accountA.id)
      .eq("event_id", eventId)
      .single();
    assert.ifError(parallelState.error);
    assert.equal(
      Number(parallelState.data?.revision),
      operationCount,
      "Jeder parallele Schreibvorgang muss genau eine neue Revision erzeugen.",
    );

    // Der explizite letzte Schreibvorgang definiert eine feste Reihenfolge
    // nach dem parallelen Block und muss dessen Status zuverlässig ersetzen.
    const finalSync = await sync(secondDevice, false);
    assert.ifError(finalSync.error);
    const saved = await accountA.client
      .from("user_event_bookmarks")
      .select("is_favorite, revision")
      .eq("user_id", accountA.id)
      .eq("event_id", eventId)
      .single();
    assert.ifError(saved.error);
    assert.equal(Number(saved.data?.revision), operationCount + 1);
    assert.equal(
      saved.data?.is_favorite,
      false,
      "Der Status muss dem zuletzt angenommenen Schreibvorgang entsprechen.",
    );
  });
});
