import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name needs at least 2 characters")
  .max(20, "Max 20 characters")
  .regex(/^[A-Za-z0-9 _.-]+$/, "Letters, numbers, spaces, _ . - only")
  .refine((n) => !/^(admin|administrator|moderator|mod|system|root|support|staff|official|fiveaside)/i.test(n.replace(/[\s_]/g, "")), "That name is reserved");

/**
 * Supabase logins need an email, so each username maps to a fixed internal address.
 * Hex-encoding the normalised name keeps it valid and one-to-one with the case-insensitive unique name.
 */
function loginEmail(name: string) {
  const norm = name.trim().replace(/\s+/g, " ").toLowerCase();
  const hex = Array.from(new TextEncoder().encode(norm), (b) => b.toString(16).padStart(2, "0")).join("");
  return `u${hex}@players.fiveaside.app`;
}

type Step = "name" | "login" | "create";

/** Password field with an eye button to show or hide what was typed. */
function PasswordInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={`${className} pr-14`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-[#111111]/60 hover:text-[#111111]"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

/** Username first; then the password for an existing name, or a new password for a free one. */
export function AuthScreen() {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  // Whatever page they logged in from, players land on Today: first question, or their picks.
  const goHome = () => navigate({ to: "/" });

  function back() {
    setStep("name");
    setPassword("");
    setConfirm("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const n = nameSchema.safeParse(name);
      if (!n.success) throw new Error(n.error.issues[0]?.message ?? "Invalid name");

      if (step === "name") {
        const { data, error } = await supabase.rpc("username_status", { _name: n.data });
        if (error) throw error;
        setStep(data === "taken" ? "login" : "create");
        return;
      }

      if (step === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(n.data), password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Offside! That password isn't right" : error.message);
        goHome();
        return;
      }

      if (password.length < 8) throw new Error("Make it at least 8 characters");
      if (password !== confirm) throw new Error("Those two don't match, try again");
      const { data, error } = await supabase.auth.signUp({
        email: loginEmail(n.data),
        password,
        options: { data: { display_name: n.data } },
      });
      if (error) throw error;
      if (!data.session) throw new Error("Account created but sign-in is blocked: turn off \"Confirm email\" in Supabase");
      goHome();
    } catch (err) {
      // Supabase errors are plain objects with a message, not Error instances.
      const message = (err as { message?: unknown })?.message;
      toast.error(typeof message === "string" && message ? message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const field = "h-14 rounded-2xl border-0 bg-white px-5 text-lg font-bold text-[#111111] placeholder:text-[#111111]/50";

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center pt-[20dvh]">
      <motion.form
        onSubmit={submit}
        className="relative z-10 mx-6 space-y-3 rounded-3xl bg-black/45 p-4 backdrop-blur-md"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        {step === "name" ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Your username"
            aria-label="Username"
            autoComplete="username"
            className={`${field} font-display`}
          />
        ) : (
          <>
            <p className="px-1 text-center font-display text-lg tracking-wide text-white">
              {step === "login" ? `Back for more, ${name.trim()}? 👋` : `New signing! Welcome, ${name.trim()} ⚽`}
            </p>
            <PasswordInput
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={step === "login" ? "Your password" : "Pick a password (8+ characters)"}
              aria-label="Password"
              autoComplete={step === "login" ? "current-password" : "new-password"}
              className={field}
            />
            {step === "create" && (
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it once more"
                aria-label="Repeat password"
                autoComplete="new-password"
                className={field}
              />
            )}
            {step === "create" && (
              <div className="flex gap-2.5 rounded-xl border border-gold/40 bg-gold/15 px-3 py-2.5 text-[0.8rem] leading-snug text-white/90">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-gold" />
                <p>
                  <span className="font-bold text-gold">Guard it like a clean sheet!</span> Pop it in your notes app. There's no "forgot password" here, so if you lose it, your streak is sent off for good.
                </p>
              </div>
            )}
          </>
        )}
        <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy}>
          {step === "name" ? "Kick off" : step === "login" ? "Back on the pitch" : "Sign me up"}
        </Button>
        {step !== "name" && (
          <button type="button" onClick={back} className="w-full text-center text-sm font-semibold text-white/80 hover:text-white">
            Wrong shirt? Pick another username
          </button>
        )}
      </motion.form>
    </div>
  );
}
