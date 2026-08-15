import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const allowedOrigins = new Set([
  "https://adelpro.com",
  "https://adintecho.com",
  "http://localhost:3000",
  "http://localhost:8000",
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const adelproPhone = "(818) 815-7755";
const adelproEmail = "adelpro1st@gmail.com";
const adelproLogo = "https://adelpro.com/assets/adelpro-logo.png";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function display(value: unknown) {
  return value ? String(value) : "Not provided";
}

function adelproEmailContent(
  requestType: string,
  requestId: string,
  createdAt: string,
  fields: Record<string, unknown>,
) {
  const emergency = requestType === "emergency";
  const title = emergency ? "Emergency Electrical Request" : "New Consultation Request";
  const accent = emergency ? "#dc2626" : "#0891b2";
  const subject = emergency
    ? "New Emergency Electrical Request — Action Required"
    : `New Adelpro Consultation Request — ${display(fields.name)}`;
  const rows = emergency
    ? [
      ["Phone", fields.phone],
      ["County", fields.county],
      ["Issue", fields.issueClass],
      ["Description", fields.message],
    ]
    : [
      ["Name", fields.name],
      ["Email", fields.email],
      ["Phone", fields.phone],
      ["Service", fields.serviceType],
      ["Preferred date", fields.preferredDate],
      ["Message", fields.message],
    ];
  const rowHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:13px;width:32%;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:14px;white-space:pre-wrap;word-break:break-word">${escapeHtml(display(value))}</td>
    </tr>`).join("");
  const plainRows = rows.map(([label, value]) => `${label}: ${display(value)}`).join("\n");
  const safety = emergency
    ? `<div style="margin:20px 0;padding:14px;border-left:4px solid #dc2626;background:#fef2f2;color:#7f1d1d;font-size:13px;line-height:1.5">Please contact the customer as soon as operationally possible. This website confirmation does not guarantee dispatch. For fire, smoke, injury, or immediate danger, the customer is instructed to call 911.</div>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)} received by Adelpro.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,.09)"><tr><td style="background:#071827;padding:24px 28px;text-align:center"><img src="${adelproLogo}" width="180" alt="Adelpro" style="display:inline-block;max-width:180px;height:auto"></td></tr><tr><td style="padding:28px"><div style="display:inline-block;background:${accent};color:#fff;border-radius:999px;padding:6px 11px;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.05em">${emergency ? "Emergency request" : "Consultation request"}</div><h1 style="margin:16px 0 6px;font-size:25px;line-height:1.25">${title}</h1><p style="margin:0 0 20px;color:#64748b;font-size:13px">Request ${escapeHtml(requestId)} · ${escapeHtml(new Date(createdAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }))} PT</p>${emergency ? `<p style="margin:0 0 18px"><a href="tel:${escapeHtml(String(fields.phone ?? "").replace(/[^+\d]/g, ""))}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Call customer now</a></p>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">${rowHtml}</table>${safety}</td></tr><tr><td style="background:#071827;padding:22px 28px;text-align:center"><img src="${adelproLogo}" width="132" alt="Adelpro" style="display:inline-block;max-width:132px;height:auto"><p style="margin:12px 0 0;color:#cbd5e1;font-size:13px;line-height:1.7"><a href="tel:+18188157755" style="color:#67e8f9;text-decoration:none">${adelproPhone}</a><br><a href="mailto:${adelproEmail}" style="color:#67e8f9;text-decoration:none">${adelproEmail}</a></p></td></tr></table></td></tr></table></body></html>`;
  const plain = `${title}\n\n${plainRows}\n\nRequest ID: ${requestId}\nSubmitted: ${createdAt}${emergency ? "\n\nPlease contact the customer as soon as operationally possible. This confirmation does not guarantee dispatch. For fire, smoke, injury, or immediate danger, the customer is instructed to call 911." : ""}\n\nAdelpro\n${adelproPhone}\n${adelproEmail}`;
  return { subject, html, plain };
}

async function sendAdelproNotification(
  requestType: string,
  requestId: string,
  createdAt: string,
  fields: Record<string, unknown>,
) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const content = adelproEmailContent(requestType, requestId, createdAt, fields);
  const payload: Record<string, unknown> = {
    from: "Adelpro <notifications@mail.adelpro.com>",
    to: [adelproEmail],
    subject: content.subject,
    html: content.html,
    text: content.plain,
  };
  if (requestType !== "emergency" && fields.email) payload.reply_to = fields.email;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `adelpro-${requestType}-${requestId}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.id) throw new Error(`Resend returned ${response.status}`);
  return String(result.id);
}

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
    notification_status: brand === "adelpro" ? "pending" : "not_configured",
  };

  const { data, error } = await supabase
    .from("business_requests")
    .upsert(record, { onConflict: "brand,idempotency_key", ignoreDuplicates: true })
    .select("id, created_at")
    .maybeSingle();
  if (error) return json(origin, 500, { error: "We could not save your request. Please call us directly." });

  const isNew = Boolean(data);
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
  if (brand === "adelpro" && isNew) {
    try {
      const providerMessageId = await sendAdelproNotification(requestType, saved.id, saved.created_at, {
        name,
        email,
        phone,
        serviceType,
        preferredDate,
        county,
        issueClass,
        message,
      });
      await Promise.all([
        supabase.from("business_requests").update({ notification_status: "sent" }).eq("id", saved.id),
        supabase.from("request_events").insert({
          request_id: saved.id,
          event_type: "notification_sent",
          provider: "resend",
          provider_message_id: providerMessageId,
        }),
      ]);
    } catch (notificationError) {
      console.error("Adelpro notification failed", notificationError instanceof Error ? notificationError.message : "Unknown error");
      await Promise.all([
        supabase.from("business_requests").update({ notification_status: "failed" }).eq("id", saved.id),
        supabase.from("request_events").insert({
          request_id: saved.id,
          event_type: "notification_failed",
          provider: "resend",
          detail: { reason: "provider_error" },
        }),
      ]);
    }
  }
  return json(origin, 201, { accepted: true, requestId: saved.id, createdAt: saved.created_at });
});
