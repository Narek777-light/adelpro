import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const allowedOrigins = new Set([
  "https://adelpro.com",
  "https://adintecho.com",
  "http://localhost:3000",
  "http://localhost:8000",
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(origin: string, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigins.has(origin)) return new Response("Forbidden", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(origin, 405, { error: "Method not allowed" });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 12_000) return json(origin, 413, { error: "Request is too large" });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(origin, 400, { error: "Invalid request" });
  }

  if (text(body.website, 100)) return json(origin, 202, { accepted: true });

  const brand = text(body.brand, 20);
  const requestType = text(body.requestType, 20);
  const idempotencyKey = text(body.idempotencyKey, 36);
  if (!idempotencyKey || !uuidPattern.test(idempotencyKey)) return json(origin, 400, { error: "Invalid request ID" });
  if (!brand || !requestType) return json(origin, 400, { error: "Missing request type" });
  if (
    !((brand === "adintecho" && ["lead", "contact"].includes(requestType)) ||
      (brand === "adelpro" && ["contact", "emergency"].includes(requestType)))
  ) return json(origin, 400, { error: "Invalid request type" });

  const name = text(body.name, 120);
  const email = text(body.email, 254)?.toLowerCase() ?? null;
  const phone = text(body.phone, 30);
  const plan = text(body.plan, 80);
  const serviceType = text(body.serviceType, 100);
  const preferredDate = text(body.preferredDate, 10);
  const county = text(body.county, 30);
  const issueClass = text(body.issueClass, 100);
  const message = text(body.message, 4000);
  const consent = body.consent === true;

  if (!phone || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15) {
    return json(origin, 400, { error: "Enter a valid phone number" });
  }
  if (email && !emailPattern.test(email)) return json(origin, 400, { error: "Enter a valid email address" });
  if (preferredDate && (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || preferredDate < new Date().toISOString().slice(0, 10))) {
    return json(origin, 400, { error: "Choose a valid future date" });
  }
  if (requestType !== "emergency" && (!name || !email || !consent)) {
    return json(origin, 400, { error: "Name, email, and consent are required" });
  }
  if (requestType === "emergency" && !["Los Angeles", "Orange"].includes(county ?? "")) {
    return json(origin, 400, { error: "Select a supported county" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(origin, 503, { error: "Service unavailable" });
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = await hmac(`${day}:${forwardedFor}`, serviceRoleKey);
  const userAgentHash = await hmac(request.headers.get("user-agent") ?? "unknown", serviceRoleKey);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error: countError } = await supabase
    .from("business_requests")
    .select("id", { count: "exact", head: true })
    .eq("brand", brand)
    .eq("ip_hash", ipHash)
    .gte("created_at", tenMinutesAgo);
  if (countError) return json(origin, 503, { error: "Service unavailable" });
  if ((count ?? 0) >= 5) return json(origin, 429, { error: "Too many requests. Please wait and try again." });

  const record = {
    brand,
    request_type: requestType,
    idempotency_key: idempotencyKey,
    name,
    email,
    phone,
    plan,
    service_type: serviceType,
    preferred_date: preferredDate,
    county,
    issue_class: issueClass,
    message,
    consent,
    source: origin,
    ip_hash: ipHash,
    user_agent_hash: userAgentHash,
    notification_status: "not_configured",
  };

  const { data, error } = await supabase
    .from("business_requests")
    .upsert(record, { onConflict: "brand,idempotency_key", ignoreDuplicates: true })
    .select("id, created_at")
    .maybeSingle();
  if (error) return json(origin, 500, { error: "We could not save your request. Please call us directly." });

  let saved = data;
  if (!saved) {
    const existing = await supabase
      .from("business_requests")
      .select("id, created_at")
      .eq("brand", brand)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    saved = existing.data;
  } else {
    await supabase.from("request_events").insert({ request_id: saved.id, event_type: "created" });
  }

  if (!saved) return json(origin, 500, { error: "We could not save your request. Please call us directly." });
  return json(origin, 201, { accepted: true, requestId: saved.id, createdAt: saved.created_at });
});
