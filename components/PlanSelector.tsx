"use client";

import { HygraphPlan, OperationType, PLAN_LIMITS } from "@/lib/query-analyzer";

interface PlanSelectorProps {
  plan: HygraphPlan;
  operationType: OperationType;
  onPlanChange: (plan: HygraphPlan) => void;
  onOperationTypeChange: (type: OperationType) => void;
}

const planLabels: Record<HygraphPlan, string> = {
  hobby: "Hobby",
  growth: "Growth",
  enterprise: "Enterprise",
};

function formatKB(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

export function PlanSelector({
  plan,
  operationType,
  onPlanChange,
  onOperationTypeChange,
}: PlanSelectorProps) {
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOperationTypeChange("query")}
          className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
            operationType === "query"
              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
              : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:border-zinc-700"
          }`}
        >
          Query
        </button>
        <button
          onClick={() => onOperationTypeChange("mutation")}
          className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
            operationType === "mutation"
              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
              : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:border-zinc-700"
          }`}
        >
          Mutation
        </button>
      </div>

      <div className="h-6 w-px bg-zinc-700" />

      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">Plan:</span>
        <select
          value={plan}
          onChange={(e) => onPlanChange(e.target.value as HygraphPlan)}
          className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-purple-500/50"
        >
          {Object.entries(planLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">
          (Limit: {formatKB(limits[operationType])})
        </span>
      </div>
    </div>
  );
}
