// Серверная часть игры: сохранение прогресса и общий рейтинг.
// Личность игрока проверяется по подписи Telegram (initData) с помощью токена бота.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Доход в секунду по каждому бизнесу (должен совпадать с BUSINESSES в index.html)
const BIZ: Record<string, number> = {
  cart: 2, room: 5, scooter: 12, shawarma: 35, coffee: 120,
  agency: 400, factory: 1200, it: 5000, holding: 50000, empire: 500000,
};
const RANK_AT = [0, 500, 3000, 15000, 100000, 1000000];
const FIRST_SAVE_LIMIT = 2_000_000; // максимум заработанного в самом первом сохранении
const ACTIVE_RATE = 300;            // запас ₽/сек на ручные действия (защита от накрутки)

const enc = new TextEncoder();
async function hmac(key: Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

// Проверка подписи Telegram: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verify(initData: string) {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  p.delete("hash");
  if (!hash) return null;
  const check = [...p.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await hmac(enc.encode("WebAppData"), BOT_TOKEN);
  const calc = [...await hmac(secret, check)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (calc !== hash) return null;
  if (Date.now() / 1000 - Number(p.get("auth_date")) > 7 * 86400) return null;
  try { return JSON.parse(p.get("user")!); } catch { return null; }
}

const n = (v: unknown, lo: number, hi: number, d = 0) => {
  const x = Math.floor(Number(v));
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};
const income = (b: Record<string, number>) => Object.keys(b).reduce((t, id) => t + (BIZ[id] ?? 0), 0);

// Оставляем только известные поля и ограничиваем значения
function clean(s: any) {
  const businesses: Record<string, number> = {};
  for (const id in BIZ) if (s?.businesses?.[id]) businesses[id] = 1;
  const totalEarned = n(s?.totalEarned, 0, 1e13);
  let rank = 0;
  RANK_AT.forEach((v, i) => { if (totalEarned >= v) rank = i; });
  return {
    money: n(s?.money, 0, totalEarned), health: n(s?.health, 0, 100, 100), mood: n(s?.mood, 0, 100, 50),
    day: n(s?.day, 1, 1e7, 1), daySecs: n(s?.daySecs, 0, 59), clicks: n(s?.clicks, 0, 1e6),
    nextEventAt: n(s?.nextEventAt, 1, 10, 4), totalEarned, rank, businesses,
    lastSaved: n(s?.lastSaved, 0, 1e14), lastSettle: n(s?.lastSettle, 0, 1e14),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const user = await verify(String(body.initData ?? ""));
    if (!user?.id) return json({ error: "unauthorized" }, 401);

    const { data: row } = await db.from("players").select("*").eq("tg_id", user.id).maybeSingle();

    if (body.action === "load") return json({ state: row?.state ?? null });

    if (body.action === "save") {
      const s = clean(body.state);
      let allowed = FIRST_SAVE_LIMIT;
      if (row) {
        const sec = Math.max(0, (Date.now() - new Date(row.updated_at).getTime()) / 1000);
        const inc = Math.max(income(s.businesses), income(row.state?.businesses ?? {}));
        allowed = Number(row.total_earned) + sec * (inc + ACTIVE_RATE) + 3000;
      }
      if (s.totalEarned > allowed) return json({ error: "suspicious" }, 422);
      const name = String(user.first_name || user.username || "Игрок").slice(0, 24);
      const { error } = await db.from("players").upsert({
        tg_id: user.id, name, state: s, total_earned: s.totalEarned,
        best_total: Math.max(Number(row?.best_total ?? 0), s.totalEarned),
        rank: s.rank, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "leaderboard") {
      const { data: top } = await db.from("players").select("tg_id,name,best_total,rank")
        .gt("best_total", 0).order("best_total", { ascending: false }).limit(20);
      const { count: total } = await db.from("players").select("tg_id", { count: "exact", head: true });
      let place = null;
      if (row) {
        const { count } = await db.from("players").select("tg_id", { count: "exact", head: true }).gt("best_total", row.best_total);
        place = (count ?? 0) + 1;
      }
      return json({
        top: (top ?? []).map((p) => ({ name: p.name, score: Number(p.best_total), rank: p.rank, me: p.tg_id === user.id })),
        place, total,
      });
    }

    return json({ error: "bad_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
