/**
 * The far side, when it is Supabase.
 *
 * A `SaveTransport` (see src/core/sync.ts) over two Postgres functions. Plain
 * `fetch`, no client library: the whole surface is two RPC calls, and a
 * dependency for that would be more code shipped to the player than the
 * feature itself.
 *
 * The keys come from the environment, never from this file. The anon key is
 * meant to be public - it is in every page that uses Supabase - but it still
 * does not belong in the repository, because a key in source is a key nobody
 * can rotate without a commit.
 *
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon key>
 *
 * With neither set, `createSupabaseTransport` returns null and the game plays
 * exactly as it did before: one browser, no sync. That is the state today.
 */
import type { PushResult, SaveTransport, SyncEnvelope } from "@core/core/index.ts";
import type { MonsterSaveFile } from "@core/core/index.ts";

export interface SupabaseKeys {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Whether a pair of values is usable, separately from where they came from.
 *
 * A mistyped host should fail once, here, rather than at every push, and
 * plain http is refused outright: the secret travels in the request body.
 */
export function validateKeys(url: unknown, anonKey: unknown): SupabaseKeys | null {
  if (typeof url !== "string" || typeof anonKey !== "string") return null;
  if (url.trim() === "" || anonKey.trim() === "") return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/+$/, ""), anonKey };
}

/** What the build was given, or null when it was given nothing. */
export function supabaseKeys(): SupabaseKeys | null {
  return validateKeys(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}

interface PulledRow {
  readonly revision: number;
  readonly based_on: number;
  readonly device_id: string;
  readonly saved_at: number;
  readonly payload: MonsterSaveFile;
}

function envelopeOf(accountId: string, row: PulledRow): SyncEnvelope {
  return {
    accountId,
    revision: row.revision,
    basedOn: row.based_on,
    deviceId: row.device_id,
    savedAt: row.saved_at,
    save: row.payload,
  };
}

/**
 * The transport, or null when the keys are absent.
 *
 * `fetch` is injectable so the behaviour above - what counts as stale, what
 * counts as rejected, what an offline reply looks like - can be checked
 * without a project and without a network.
 */
export interface TransportOptions {
  /**
   * The secret of the account this browser holds.
   *
   * Needed because reading a save is reading the player's whole game, so the
   * far side asks for the secret on both calls, while `SaveTransport.pull`
   * carries only the id. One browser holds one account, so the transport is
   * built for that account and rebuilt if the player adopts another code.
   */
  readonly secret: string;
  readonly fetch?: typeof fetch;
}

export function createSupabaseTransport(
  keys: SupabaseKeys | null,
  options: TransportOptions,
): SaveTransport | null {
  if (!keys) return null;
  const reach = keys;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function rpc(name: string, body: unknown): Promise<unknown> {
    const response = await doFetch(`${reach.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: reach.anonKey,
        Authorization: `Bearer ${reach.anonKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${name}: ${response.status}`);
    }
    return response.json();
  }

  return {
    async pull(accountId) {
      // Throws when the far side cannot be reached, deliberately. Answering
      // null would read as "this account has nothing stored", and the caller
      // would then push revision 1 over whatever is actually there.
      const rows = await rpc("save_pull", { p_account_id: accountId, p_secret: options.secret });
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return envelopeOf(accountId, rows[0] as PulledRow);
    },

    async push(envelope, secret): Promise<PushResult> {
      let answer: unknown;
      try {
        answer = await rpc("save_push", {
          p_account_id: envelope.accountId,
          p_secret: secret,
          p_revision: envelope.revision,
          p_based_on: envelope.basedOn,
          p_device_id: envelope.deviceId,
          p_saved_at: envelope.savedAt,
          p_payload: envelope.save,
        });
      } catch (error) {
        return {
          ok: false,
          reason: "offline",
          message: `同期できませんでした：${error instanceof Error ? error.message : "不明"}`,
        };
      }
      const result = answer as Record<string, unknown> | null;
      const status = result?.status;
      if (status === "ok") return { ok: true, stored: envelope };
      if (status === "stale") {
        // The far side hands back what it holds, so the caller can settle the
        // divergence without a second round trip.
        if (typeof result?.payload === "object" && result.payload !== null) {
          return {
            ok: false,
            reason: "stale",
            stored: envelopeOf(envelope.accountId, {
              revision: Number(result.revision),
              based_on: Number(result.based_on),
              device_id: String(result.device_id),
              saved_at: Number(result.saved_at),
              payload: result.payload as MonsterSaveFile,
            }),
          };
        }
        return {
          ok: false,
          reason: "offline",
          message: "向こう側が先に書き換わっていました。もう一度試してください。",
        };
      }
      return {
        ok: false,
        reason: "rejected",
        message: typeof result?.message === "string"
          ? `断られました：${result.message}`
          : "このアカウントには書き込めませんでした。",
      };
    },
  };
}
