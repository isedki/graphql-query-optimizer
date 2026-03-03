"use client";

import { formatBytes, ComplexityMetrics } from "@/lib/query-analyzer";

interface MetricsBarProps {
  totalSize: number;
  complexity: ComplexityMetrics;
  selectedCount: number;
  totalCount: number;
  isValid: boolean;
  operationName?: string;
  operationType: string;
  localeCount: number;
  localeNames: string[];
  variableCount: number;
  fragmentCount: number;
  issueCount: number;
}

function Pill({
  label,
  value,
  className = "",
  title,
}: {
  label: string;
  value: string | number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/60 text-xs ${className}`}
      title={title}
    >
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200 font-medium">{value}</span>
    </span>
  );
}

export function MetricsBar({
  totalSize,
  complexity,
  selectedCount,
  totalCount,
  isValid,
  operationName,
  operationType,
  localeCount,
  localeNames,
  variableCount,
  fragmentCount,
  issueCount,
}: MetricsBarProps) {
  if (!isValid) return null;

  const opLabel = operationName
    ? `${operationType} ${operationName}`
    : operationType;

  const localeLabel =
    localeCount === 0
      ? null
      : localeNames.length > 0 && localeNames.length <= 3
        ? localeNames.join(", ")
        : localeCount === 1
          ? "1 locale"
          : `${localeCount} locales`;

  return (
    <div className="glass-card rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/15 border border-purple-500/20 text-xs">
          <span className="text-purple-300 font-medium">{opLabel}</span>
        </span>

        <Pill label="Size" value={formatBytes(totalSize)} title="Total HTTP request body size (query + variables)" />
        <Pill label="Fields" value={`${selectedCount}/${totalCount}`} />
        <Pill label="Depth" value={complexity.depth} />
        <Pill label="Connections" value={complexity.connectionCount} />

        {localeLabel && (
          <Pill
            label="Locales"
            value={localeLabel}
            title={localeNames.length > 3 ? localeNames.join(", ") : undefined}
          />
        )}

        {variableCount > 0 && (
          <Pill label="Variables" value={variableCount} />
        )}

        {fragmentCount > 0 && (
          <Pill label="Fragments" value={fragmentCount} />
        )}

        {issueCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs">
            <span className="text-amber-400 font-medium">
              {issueCount} {issueCount === 1 ? "issue" : "issues"}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
