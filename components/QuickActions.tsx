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
  splitMode?: boolean;
  onRemoveSystemFieldsAll?: () => void;
  onFixRichTextAll?: () => void;
  onExtractFragmentsAll?: () => void;
  onFixPaginationAll?: () => void;
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
  splitMode,
  onRemoveSystemFieldsAll,
  onFixRichTextAll,
  onExtractFragmentsAll,
  onFixPaginationAll,
}: QuickActionsProps) {
  const actions: {
    key: string;
    label: string;
    onClick: () => void;
    onClickAll?: () => void;
    show: boolean;
  }[] = [
    {
      key: "system",
      label: `Remove ${safeSystemFieldCount} system field${safeSystemFieldCount !== 1 ? "s" : ""}`,
      onClick: onRemoveSystemFields,
      onClickAll: onRemoveSystemFieldsAll,
      show: safeSystemFieldCount > 0,
    },
    {
      key: "richtext",
      label: `Fix ${richTextFixCount} RichText format${richTextFixCount !== 1 ? "s" : ""}`,
      onClick: onFixRichText,
      onClickAll: onFixRichTextAll,
      show: richTextFixCount > 0,
    },
    {
      key: "fragments",
      label: `Extract ${fragmentCount} fragment${fragmentCount !== 1 ? "s" : ""}`,
      onClick: onExtractFragments,
      onClickAll: onExtractFragmentsAll,
      show: fragmentCount > 0,
    },
    {
      key: "pagination",
      label: `Add pagination to ${paginationIssueCount} field${paginationIssueCount !== 1 ? "s" : ""}`,
      onClick: onFixPagination,
      onClickAll: onFixPaginationAll,
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
        <span key={action.key} className="inline-flex items-center">
          <button
            onClick={action.onClick}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            {action.label}
          </button>
          {splitMode && action.onClickAll && (
            <button
              onClick={action.onClickAll}
              title="Apply to all split tabs"
              className="ml-0.5 px-1.5 py-1.5 text-[10px] font-semibold rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors"
            >
              +all
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
