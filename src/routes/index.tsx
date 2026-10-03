import { createFileRoute } from "@tanstack/react-router";
import { Gate } from "@/components/game/Gate";
import { PlayDeck } from "@/components/game/PlayDeck";
import { LockedIn } from "@/components/game/LockedIn";
import { Countdown } from "@/components/game/bits";
import { useProfile, useToday } from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Five-a-Side — Daily Premier League predictions" },
      { name: "description", content: "Answer 5 quick Premier League prediction questions a day, build your streak and climb the leaderboard." },
      { property: "og:title", content: "Five-a-Side — Daily Premier League predictions" },
      { property: "og:description", content: "5 questions. 30 seconds. Every day. Build your streak and climb the table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <>
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: "linear-gradient(rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.45)), url(/poster.png)" }}
      />
      <Gate>{(uid) => <Today userId={uid} />}</Gate>
    </>
  ),
});

function Today({ userId }: { userId: string }) {
  const today = useToday(userId);
  const profile = useProfile(userId);
  if (today.isLoading) return <div className="h-[460px] animate-pulse rounded-3xl bg-card" />;
  if (today.error) return <p className="text-destructive">Couldn't load today's questions.</p>;
  const { questions, answers } = today.data!;
  const live = questions.filter((q) => q.status === "live");

  if (answers.length > 0) {
    return <LockedIn questions={questions} answers={answers} streak={profile.data?.current_streak ?? 0} />;
  }
  if (live.length === 0) {
    return (
      <div className="ticket p-8 text-center">
        <h1 className="display-xl text-3xl">No questions yet today</h1>
        <p className="mt-2 text-muted-foreground">Check back soon. Next day starts in</p>
        <p className="mt-1 font-display text-3xl font-black"><Countdown /></p>
      </div>
    );
  }
  return <PlayDeck questions={live} />;
}
