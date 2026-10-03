import type { ReactNode } from "react";
import { useSession } from "@/lib/game";
import { AuthScreen } from "./AuthScreen";
import { AppShell } from "./AppShell";

/** Renders the username + password screen when signed out, otherwise the app shell. */
export function Gate({ children }: { children: (userId: string) => ReactNode }) {
  const { ready, session, userId } = useSession();
  if (!ready) return <div className="min-h-dvh" />;
  // Leftover guest sessions from the old no-password login must sign in properly.
  if (!userId || session?.user.is_anonymous) return <AuthScreen />;
  return <AppShell userId={userId}>{children(userId)}</AppShell>;
}
