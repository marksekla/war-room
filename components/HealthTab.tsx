"use client";

import { useState } from "react";
import type { LeagueModel } from "@/lib/model";
import Availability from "./Availability";
import InjuryRecap from "./InjuryRecap";
import ModeSwitch from "./ModeSwitch";

export default function HealthTab({ model, myId }: { model: LeagueModel; myId: number }) {
  const [mode, setMode] = useState<"now" | "recap">("now");
  const last = model.reviewWeeks()[0];
  return (
    <div className="space-y-6">
      <ModeSwitch
        value={mode}
        onChange={setMode}
        options={[
          { id: "now", label: `Week ${model.week} status` },
          { id: "recap", label: last ? `Week ${last} injury recap` : "Injury recap" },
        ]}
      />
      {mode === "now" ? <Availability model={model} myId={myId} /> : <InjuryRecap model={model} myId={myId} />}
    </div>
  );
}
