import type { ReactNode } from "react";
import { useProfile, useSession } from "@/lib/game";
import { AuthScreen } from "./AuthScreen";
import { AppShell } from "./AppShell";
import { VerifyEmail } from "./VerifyEmail";

/** Renders the username + password screen when signed out, the email check for new players, otherwise the app shell. */
export function Gate({ children }: { children: (userId: string) => ReactNode }) {
  const { ready, session, userId } = useSession();
  const profile = useProfile(userId);
  if (!ready) return <div className="min-h-dvh" />;
  // Leftover guest sessions from the old no-password login must sign in properly.
  if (!userId || session?.user.is_anonymous) return <AuthScreen />;
  if (profile.isLoading) return <div className="min-h-dvh" />;
  // New signups must verify an email first; players from before this existed have needs_email = false.
  if (profile.data?.needs_email && !profile.data.email_verified_at) return <VerifyEmail userId={userId} />;
  return <AppShell userId={userId}>{children(userId)}</AppShell>;
}
