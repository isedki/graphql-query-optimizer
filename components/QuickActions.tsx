"use client";

interface QuickActionsProps {
  safeSystemFieldCount: number;
  onRemoveSystemFields: () => void;
  richTextFixCount: number;
  onFixRichText: () => void;
  fragmentCount: number;
  onExtractFragments: () => void;
  paginationIssueCount: number;
  onFixPagination: () => void;
}

export function QuickActions({
  safeSystemFieldCount,
  onRemoveSystemFields,
  richTextFixCount,
  onFixRichText,
  fragmentCount,
  onExtractFragments,
  paginationIssueCount,
  onFixPagination,
}: QuickActionsProps) {
  const actions: { key: string; label: string; onClick: () => void; show: boolean }[] = [
    {
      key: "system",
      label: `Remove ${safeSystemFieldCount} system field${safeSystemFieldCount !== 1 ? "s" : ""}`,
      onClick: onRemoveSystemFields,
      show: safeSystemFieldCount > 0,
    },
    {
      key: "richtext",
      label: `Fix ${richTextFixCount} RichText format${richTextFixCount !== 1 ? "s" : ""}`,
      onClick: onFixRichText,
      show: richTextFixCount > 0,
    },
    {
      key: "fragments",
      label: `Extract ${fragmentCount} fragment${fragmentCount !== 1 ? "s" : ""}`,
      onClick: onExtractFragments,
      show: fragmentCount > 0,
    },
    {
      key: "pagination",
      label: `Add pagination to ${paginationIssueCount} field${paginationIssueCount !== 1 ? "s" : ""}`,
      onClick: onFixPagination,
      show: paginationIssueCount > 0,
    },
  ];

  const visible = actions.filter((a) => a.show);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
        Quick fixes
      </span>
      {visible.map((action) => (
        <button
          key={action.key}
          onClick={action.onClick}
          className="px-3 py-1.5 text-xs font-medium rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
