"use client";

import { formatBytes, getPayloadStatus, PayloadMetrics, ComplexityMetrics } from "@/lib/query-analyzer";

interface MetricsBarProps {
  payload: PayloadMetrics;
  complexity: ComplexityMetrics;
  selectedCount: number;
  totalCount: number;
  isValid: boolean;
}

export function MetricsBar({
  payload,
  complexity,
  selectedCount,
  totalCount,
  isValid,
}: MetricsBarProps) {
  if (!isValid) return null;

  const status = getPayloadStatus(payload.percentageUsed);
  const statusColors: Record<string, string> = {
    safe: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-orange-500",
    critical: "bg-red-500",
  };

  return (
    <div className="glass-card rounded-xl p-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Size indicator */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-xs text-zinc-500 shrink-0" title="Actual HTTP request body size as sent to Hygraph API">
            Request body:
          </span>
          <span className="text-xs font-medium text-zinc-300">
            {formatBytes(payload.totalSize)}
          </span>
          <span className="text-xs text-zinc-600">/</span>
          <span className="text-xs text-zinc-500">
            {formatBytes(payload.planLimit)}
          </span>
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden min-w-[60px]">
            <div
              className={`h-full rounded-full transition-all ${statusColors[status]}`}
              style={{ width: `${Math.min(payload.percentageUsed, 100)}%` }}
            />
          </div>
          <span className={`text-xs font-medium ${
            status === "critical" ? "text-red-400" :
            status === "danger" ? "text-orange-400" :
            status === "warning" ? "text-amber-400" :
            "text-emerald-400"
          }`}>
            {payload.percentageUsed}%
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>
            <span className="text-zinc-300 font-medium">{selectedCount}</span>/{totalCount} fields
          </span>
          <span className="text-zinc-700">|</span>
          <span>
            Depth: <span className="text-zinc-300 font-medium">{complexity.depth}</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span>
            Connections: <span className="text-zinc-300 font-medium">{complexity.connectionCount}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
