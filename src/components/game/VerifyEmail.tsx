import { useState } from "react";
import { motion } from "motion/react";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { sendEmailCode, verifyEmailCode } from "@/lib/email.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const field = "h-14 rounded-2xl border-0 bg-white px-5 text-lg font-bold text-[#111111] placeholder:text-[#111111]/50";

function errorMessage(err: unknown) {
  const message = (err as { message?: unknown })?.message;
  return typeof message === "string" && message ? message : "Something went wrong";
}

/** Shown to new players after they pick a password: email first, then the 6-digit code we send them. */
export function VerifyEmail({ userId }: { userId: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function sendCode() {
    const parsed = z.string().trim().email("That doesn't look like an email address").safeParse(email);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
    await sendEmailCode({ data: { email: parsed.data } });
    setStep("code");
    toast.success("Code sent. Check your inbox (and spam)");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (step === "email") {
        await sendCode();
      } else {
        await verifyEmailCode({ data: { code: code.trim() } });
        await qc.invalidateQueries({ queryKey: ["profile", userId] });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      await sendCode();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    qc.cancelQueries().then(() => {
      qc.clear();
      return supabase.auth.signOut();
    });
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center pt-[10dvh]">
      <motion.form
        onSubmit={submit}
        className="relative z-10 mx-6 space-y-3 rounded-3xl bg-black/45 p-4 backdrop-blur-md"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <p className="flex items-center justify-center gap-2 px-1 text-center font-display text-lg tracking-wide text-white">
          <MailCheck className="size-5 text-gold" />
          {step === "email" ? "One last step: verify your email" : "Enter the 6-digit code"}
        </p>
        {step === "email" ? (
          <Input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
            autoComplete="email"
            className={field}
          />
        ) : (
          <>
            <p className="px-1 text-center text-sm text-white/80">We sent it to {email.trim()}. It expires in 10 minutes.</p>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label="Verification code"
              className={`${field} text-center tracking-[0.5em]`}
            />
          </>
        )}
        <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy || (step === "code" && code.length !== 6)}>
          {step === "email" ? "Send me a code" : "Verify"}
        </Button>
        {step === "code" && (
          <div className="flex justify-center gap-4 text-sm font-semibold text-white/80">
            <button type="button" onClick={resend} disabled={busy} className="hover:text-white">Resend code</button>
            <button type="button" onClick={() => { setStep("email"); setCode(""); }} className="hover:text-white">Change email</button>
          </div>
        )}
        <button type="button" onClick={signOut} className="w-full text-center text-xs text-white/60 hover:text-white">Sign out</button>
      </motion.form>
    </div>
  );
}
