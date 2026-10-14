"use client";

import { useState } from "react";
import type { LeagueModel } from "@/lib/model";
import DepthCharts from "./DepthCharts";
import UsageSplits from "./UsageSplits";
import ModeSwitch from "./ModeSwitch";

export default function DepthTab({ model, myId }: { model: LeagueModel; myId: number }) {
  const [mode, setMode] = useState<"depth" | "usage">("depth");
  const last = model.reviewWeeks()[0];
  return (
    <div className="space-y-6">
      <ModeSwitch
        value={mode}
        onChange={setMode}
        options={[
          { id: "depth", label: "Depth charts" },
          { id: "usage", label: last ? `Week ${last} usage` : "Usage splits" },
        ]}
      />
      {mode === "depth" ? <DepthCharts model={model} myId={myId} /> : <UsageSplits model={model} myId={myId} />}
    </div>
  );
}
