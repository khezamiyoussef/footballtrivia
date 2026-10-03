import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

async function sendMail(to: string, code: string) {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];
  if (!key || !from) throw new Error("Email sending isn't configured (RESEND_API_KEY / EMAIL_FROM)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `${code} is your Five-a-Side code`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px">
        <h2 style="margin:0 0 12px">Welcome to Five-a-Side ⚽</h2>
        <p>Your verification code is:</p>
        <p style="font-size:34px;font-weight:bold;letter-spacing:8px;margin:12px 0">${code}</p>
        <p style="color:#666">It expires in 10 minutes. If you didn't sign up, ignore this email.</p></div>`,
    }),
  });
  if (!res.ok) {
    console.error("[email] Resend failed", res.status, await res.text());
    throw new Error("Couldn't send the email. Check the address and try again");
  }
}

export async function sendCode(userId: string, email: string) {
  const { data: profile } = await supabaseAdmin.from("profiles").select("email_verified_at").eq("id", userId).single();
  if (profile?.email_verified_at) throw new Error("Your email is already verified");

  const { data: taken } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .not("email_verified_at", "is", null)
    .neq("id", userId)
    .maybeSingle();
  if (taken) throw new Error("That email is already used by another player");

  const { data: existing } = await supabaseAdmin.from("email_codes").select("created_at").eq("user_id", userId).maybeSingle();
  if (existing && Date.now() - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_MS) {
    throw new Error("Wait a minute before asking for another code");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await supabaseAdmin.from("email_codes").upsert({
    user_id: userId,
    email,
    code_hash: hashCode(userId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error("Couldn't start verification");
  try {
    await sendMail(email, code);
  } catch (e) {
    await supabaseAdmin.from("email_codes").delete().eq("user_id", userId);
    throw e;
  }
}

export async function checkCode(userId: string, code: string) {
  const { data: row } = await supabaseAdmin.from("email_codes").select("*").eq("user_id", userId).maybeSingle();
  if (!row) throw new Error("Ask for a new code first");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("That code expired. Ask for a new one");
  if (row.attempts >= MAX_ATTEMPTS) throw new Error("Too many tries. Ask for a new code");

  await supabaseAdmin.from("email_codes").update({ attempts: row.attempts + 1 }).eq("user_id", userId);
  const a = Buffer.from(hashCode(userId, code));
  const b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Wrong code, try again");

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ email: row.email, email_verified_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    if (error.code === "23505") throw new Error("That email is already used by another player");
    throw new Error("Couldn't save your email");
  }
  await supabaseAdmin.from("email_codes").delete().eq("user_id", userId);
}
