import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Home, Trophy, ListChecks, Shield, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useProfile } from "@/lib/game";
import { Logo, StreakFlame } from "./bits";

export function AppShell({ userId, children }: { userId: string; children: ReactNode }) {
  const { data: profile } = useProfile(userId);
  const { data: isAdmin } = useIsAdmin(userId);
  const qc = useQueryClient();
  const tab = "flex flex-1 flex-col items-center gap-1 py-2.5 font-display text-xs tracking-widest text-primary-foreground/60 transition-colors";
  const active = { className: "text-gold" };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between px-5 pt-5">
        <Link to="/" aria-label="Home"><Logo /></Link>
        <div className="flex items-center gap-2">
          <StreakFlame n={profile?.current_streak ?? 0} />
          <button
            aria-label="Sign out"
            className="rounded-full p-2 text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await qc.cancelQueries();
              qc.clear();
              await supabase.auth.signOut();
            }}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 px-5 pb-28 pt-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-border bg-primary">
        <div className="mx-auto flex max-w-md px-2 pb-[env(safe-area-inset-bottom)]">
          <Link to="/" className={tab} activeProps={active} activeOptions={{ exact: true }}>
            <Home className="size-5" />Today
          </Link>
          <Link to="/leaderboard" className={tab} activeProps={active}>
            <Trophy className="size-5" />Leaders
          </Link>
          <Link to="/results" className={tab} activeProps={active}>
            <ListChecks className="size-5" />Results
          </Link>
          {isAdmin && (
            <Link to="/admin" className={tab} activeProps={active}>
              <Shield className="size-5" />Admin
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
