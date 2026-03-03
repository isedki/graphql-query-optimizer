"use client";

import { LocaleInfo, LOCALE_NAMES } from "@/lib/query-analyzer";

interface LocaleTogglesProps {
  localeInfos: LocaleInfo[];
  selectedLocales: Set<string>;
  onToggle: (locale: string) => void;
  estimatedSavings?: number;
}

export function LocaleToggles({
  localeInfos,
  selectedLocales,
  onToggle,
  estimatedSavings,
}: LocaleTogglesProps) {
  const allLocales = Array.from(new Set(localeInfos.flatMap((l) => l.locales)));

  if (allLocales.length === 0) return null;

  const removedCount = allLocales.filter((l) => !selectedLocales.has(l)).length;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-purple-500/10">
          <GlobeIcon className="w-4 h-4 text-purple-400" />
        </div>
        <h3 className="font-medium text-zinc-300">Locales</h3>
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {allLocales.map((locale) => {
          const isSelected = selectedLocales.has(locale);
          const fullName = LOCALE_NAMES[locale] || locale;
          return (
            <button
              key={locale}
              onClick={() => onToggle(locale)}
              title={fullName}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                isSelected
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                  : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 line-through"
              }`}
            >
              {locale}
            </button>
          );
        })}
      </div>

      {removedCount > 0 && estimatedSavings !== undefined && estimatedSavings > 0 && (
        <p className="text-[10px] text-emerald-400">
          Removing {removedCount} locale{removedCount > 1 ? "s" : ""} saves ~{estimatedSavings} bytes
        </p>
      )}

      {allLocales.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
          {allLocales.map((l) => (
            <span key={l} className="text-[10px] text-zinc-600">
              {l} = {LOCALE_NAMES[l] || "Unknown"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}
