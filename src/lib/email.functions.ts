import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Emails a 6-digit code to the address the signed-in player wants to verify. */
export const sendEmailCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sendCode } = await import("./email.server");
    await sendCode(context.userId, data.email);
    return { ok: true };
  });

/** Checks the code and, if right, marks the player's email as verified. */
export const verifyEmailCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { checkCode } = await import("./email.server");
    await checkCode(context.userId, data.code);
    return { ok: true };
  });
