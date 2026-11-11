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

  const account = { id: data.user.id, client: null, email, password };
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
      accounts.map(({ id }) => admin.auth.admin.deleteUser(id)),
    );
    for (const result of cleanupResults) assert.ifError(result.error);
  }
}

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
    const realtimeEventId = `same-account-device-${randomUUID()}`;
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

    try {
      await waitForSignal(
        subscribed,
        "Zweites Gerät konnte Realtime nicht abonnieren. Prüfe Migration 0004.",
      );
      const realtimeSync = await sync(accountA.client, realtimeEventId, true);
      assert.ifError(realtimeSync.error);
      const received = await waitForSignal(
        realtimeChange,
        "Zweites Gerät erhielt keine Favoritenänderung. Prüfe Migration 0004.",
      );
      assert.equal(received.new.user_id, accountA.id);
      assert.equal(received.new.is_favorite, true);

      const fromSecondDevice = await secondDevice
        .from("user_event_bookmarks")
        .select("is_favorite")
        .eq("user_id", accountA.id)
        .eq("event_id", realtimeEventId)
        .single();
      assert.ifError(fromSecondDevice.error);
      assert.equal(fromSecondDevice.data?.is_favorite, true);
    } finally {
      await secondDevice.removeChannel(realtimeChannel);
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
