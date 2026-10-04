"use client";

import { LeagueProvider } from "@/lib/LeagueContext";
import Shell from "@/components/Shell";

export default function Home() {
  return (
    <LeagueProvider>
      <Shell />
    </LeagueProvider>
  );
}
