import type { Metadata } from "next";
import { LeaderboardView } from "@/components/LeaderboardView";

export const metadata: Metadata = {
  title: "Leaderboard · Grout Bhar Denge",
  description: "Aaj ke aur all-time top mistri.",
};

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
