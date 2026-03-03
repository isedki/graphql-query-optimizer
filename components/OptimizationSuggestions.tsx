"use client";

import { useState } from "react";
import { Suggestion, SuggestionSeverity } from "@/lib/query-optimizer";

interface OptimizationSuggestionsProps {
  suggestions: Suggestion[];
  onApply?: (suggestionId: string) => void;
}

export function OptimizationSuggestions({
  suggestions,
  onApply,
}: OptimizationSuggestionsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (suggestions.length === 0) {
    return (
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-emerald-500/10">
            <CheckIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="font-medium text-zinc-300">Suggestions</h3>
        </div>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
            <CheckIcon className="w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-sm text-zinc-400">
            No optimization suggestions
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Your query looks good!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <LightbulbIcon className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="font-medium text-zinc-300">Suggestions</h3>
        </div>
        <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded-md">
          {suggestions.length} {suggestions.length === 1 ? "issue" : "issues"}
        </span>
      </div>

      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <SuggestionItem
            key={suggestion.id}
            suggestion={suggestion}
            isExpanded={expandedIds.has(suggestion.id)}
            onToggle={() => toggleExpanded(suggestion.id)}
            onApply={onApply ? () => onApply(suggestion.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

interface SuggestionItemProps {
  suggestion: Suggestion;
  isExpanded: boolean;
  onToggle: () => void;
  onApply?: () => void;
}

function SuggestionItem({
  suggestion,
  isExpanded,
  onToggle,
  onApply,
}: SuggestionItemProps) {
  const severityConfig: Record<
    SuggestionSeverity,
    { icon: React.ReactNode; bgColor: string; borderColor: string; textColor: string }
  > = {
    error: {
      icon: <ErrorIcon className="w-4 h-4" />,
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      textColor: "text-red-400",
    },
    warning: {
      icon: <WarningIcon className="w-4 h-4" />,
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
      textColor: "text-amber-400",
    },
    info: {
      icon: <InfoIcon className="w-4 h-4" />,
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      textColor: "text-blue-400",
    },
  };

  const config = severityConfig[suggestion.severity];

  return (
    <div
      className={`rounded-lg border ${config.borderColor} ${config.bgColor} overflow-hidden`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className={`mt-0.5 ${config.textColor}`}>{config.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-200">
                  {suggestion.title}
                </span>
                {suggestion.impactPercentage !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    suggestion.impactPercentage < 0 
                      ? "bg-emerald-500/10 text-emerald-400" 
                      : "bg-zinc-800/50 text-zinc-400"
                  }`}>
                    {suggestion.impactPercentage < 0 ? "" : "+"}{suggestion.impactPercentage}%
                  </span>
                )}
                {suggestion.impact && !suggestion.impactPercentage && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-400">
                    {suggestion.impact}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {suggestion.description}
              </p>
            </div>
          </div>

          {suggestion.canAutoFix && onApply && (
            <button
              onClick={onApply}
              className="shrink-0 px-2 py-1 text-xs font-medium rounded-md bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
            >
              {suggestion.autoFixLabel || "Apply"}
            </button>
          )}
        </div>

        <button
          onClick={onToggle}
          className="flex items-center gap-1 mt-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
        >
          <ChevronIcon
            className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
          Why this matters
        </button>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {suggestion.duplicateDetails && suggestion.duplicateDetails.length > 0 && (
            <div className="p-3 rounded-md bg-zinc-900/50 border border-white/5">
              <h4 className="text-xs font-medium text-zinc-400 mb-2">
                Duplicate Field Locations:
              </h4>
              <div className="space-y-2">
                {suggestion.duplicateDetails.slice(0, 5).map((dup, idx) => (
                  <div key={idx}>
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-xs font-medium text-amber-400">
                        {dup.fieldName}
                      </code>
                      <span className="text-xs text-zinc-500">
                        appears {dup.count} times
                      </span>
                    </div>
                    <div className="pl-3 space-y-0.5">
                      {dup.occurrences.slice(0, 4).map((occ, occIdx) => (
                        <div key={occIdx} className="flex items-center gap-1">
                          <span className="text-zinc-600 text-xs">→</span>
                          <code className="text-xs text-zinc-400">
                            {occ.fullPath}
                          </code>
                        </div>
                      ))}
                      {dup.occurrences.length > 4 && (
                        <span className="text-xs text-zinc-500 pl-3">
                          +{dup.occurrences.length - 4} more locations
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {suggestion.duplicateDetails.length > 5 && (
                  <p className="text-xs text-zinc-500 mt-2">
                    +{suggestion.duplicateDetails.length - 5} more duplicate fields
                  </p>
                )}
              </div>
            </div>
          )}
          
          <div className="p-3 rounded-md bg-zinc-900/50 border border-white/5">
            <div className="flex items-start gap-2">
              <BookIcon className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
              <p className="text-xs text-zinc-400 leading-relaxed">
                {suggestion.whyItMatters}
              </p>
            </div>
            <a
              href="https://hygraph.com/docs/api-reference/basics/api-limits"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ExternalLinkIcon className="w-3 h-3" />
              View Hygraph docs
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}
