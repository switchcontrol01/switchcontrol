import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages, Search, X } from "lucide-react";
import { LOCALES, useTranslation } from "@/lib/i18n";
import type { Locale } from "@/stores/userPreferencesStore";

export function WebsiteLanguagePicker({ mobile = false }: { mobile?: boolean }) {
  const { language, setLanguage, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const current = LOCALES.find((locale) => locale.code === language) ?? LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const filteredLocales = LOCALES.filter((locale) => {
    const value = `${locale.nativeName} ${locale.englishName} ${locale.code}`.toLowerCase();
    return value.includes(query.trim().toLowerCase());
  });

  return (
    <div ref={pickerRef} className={`relative ${mobile ? "w-full" : "shrink-0"}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setQuery("");
        }}
        className={mobile
          ? "group flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/[0.08] px-4 py-2.5 text-sm font-semibold text-white/85 transition-all hover:border-cyan-200/50 hover:bg-cyan-300/[0.14]"
          : "group flex h-10 items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/[0.10] px-3 text-sm font-semibold text-white/90 shadow-[0_0_22px_rgba(0,212,255,0.10)] transition-all hover:border-cyan-200/60 hover:bg-cyan-300/[0.16] hover:shadow-[0_0_28px_rgba(0,212,255,0.18)]"}
        aria-label={t("Website language")}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="button-website-language"
      >
        <Languages className="size-4 text-cyan-200 transition-transform duration-300 group-hover:rotate-12" />
        <span className={mobile ? "" : "hidden sm:inline"}>{current.code === "en" ? "EN" : current.code}</span>
        <ChevronDown className={`size-3.5 text-white/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("Choose your website language")}
          className={`absolute z-[70] mt-3 overflow-hidden rounded-2xl border border-white/[0.16] bg-[#0a0e16]/[0.97] shadow-[0_24px_80px_rgba(0,0,0,0.58),0_0_32px_rgba(0,212,255,0.10)] backdrop-blur-2xl ${mobile ? "left-0 right-0" : "right-0 w-[min(360px,calc(100vw-2rem))]"}`}
        >
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
          <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4">
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">{t("Website language")}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">{t("Choose the language for the SwitchControl website.")}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/80"
              aria-label={t("Close")}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.045] px-3">
              <Search className="size-3.5 shrink-0 text-white/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search languages")}
                className="h-9 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/30"
                autoFocus
                aria-label={t("Search languages")}
              />
            </div>
          </div>

          <div className="max-h-[min(52vh,380px)] overflow-y-auto px-2 pb-2">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {filteredLocales.map((locale) => {
                const selected = locale.code === language;
                return (
                  <button
                    type="button"
                    key={locale.code}
                    onClick={() => {
                      setLanguage(locale.code as Locale);
                      setOpen(false);
                    }}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                      selected
                        ? "border border-cyan-300/25 bg-cyan-300/[0.12] text-white"
                        : "border border-transparent text-white/70 hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-white"
                    }`}
                    data-testid={`website-language-${locale.code}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{locale.nativeName}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-white/35">{locale.englishName}</span>
                    </span>
                    {selected && <Check className="size-4 shrink-0 text-cyan-200" />}
                  </button>
                );
              })}
            </div>
            {filteredLocales.length === 0 && (
              <p className="px-3 py-7 text-center text-xs text-white/45">{t("No languages found")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}