import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "@/lib/motionTokens";
import { Check, ChevronRight, Languages, ShieldCheck, Sparkles } from "lucide-react";
import { LOCALES, useTranslation, type Locale } from "@/lib/i18n";

interface FirstRunLanguageModalProps {
  userId: string;
  accountLabel: string;
  onComplete: (locale: Locale) => void;
}

type ModalStep = "prompt" | "picker";

const LANGUAGE_PROMPT_KEY = "sc_language_prompt_seen_";
const EXIT_DURATION_MS = 2000;
const SILK = [0.22, 1, 0.36, 1] as const;

/**
 * Required first-session language gate.
 *
 * It deliberately has no backdrop-dismiss or escape action: the account is
 * already authenticated, and the choice must be saved before onboarding can
 * begin. The component owns the long exit animation so App.tsx only advances
 * once the visual handoff is complete.
 */
export function FirstRunLanguageModal({
  userId,
  accountLabel,
  onComplete,
}: FirstRunLanguageModalProps) {
  const { t, language, setLanguage } = useTranslation();
  const [step, setStep] = useState<ModalStep>("prompt");
  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    language === "en" ? "en" : language,
  );
  const [isExiting, setIsExiting] = useState(false);
  const [isEntered, setIsEntered] = useState(false);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    const first = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsEntered(true));
    });
    return () => cancelAnimationFrame(first);
  }, []);

  useEffect(
    () => () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    },
    [],
  );

  const finish = (locale: Locale) => {
    if (isExiting) return;

    // Persist both the choice and the per-account completion marker before
    // starting the exit. Onboarding cannot begin until this synchronous write
    // has completed.
    setLanguage(locale);
    localStorage.setItem(`${LANGUAGE_PROMPT_KEY}${userId}`, locale);
    setIsExiting(true);

    completionTimerRef.current = setTimeout(
      () => onComplete(locale),
      prefersReduced ? 0 : EXIT_DURATION_MS,
    );
  };

  const selectedMeta =
    LOCALES.find((locale) => locale.code === selectedLocale) ?? LOCALES[0];

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden px-4 py-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-language-title"
        aria-describedby="first-run-language-description"
        data-testid="first-run-language-modal"
        initial={{ opacity: 0, filter: "blur(18px)" }}
        animate={{
          opacity: isEntered && !isExiting ? 1 : 0,
          filter: isEntered && !isExiting ? "blur(0px)" : "blur(18px)",
          transition: {
            duration: isExiting && !prefersReduced ? 2 : prefersReduced ? 0 : 0.75,
            ease: SILK,
          },
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 100% 90% at 50% 0%, rgba(4,19,36,0.985) 0%, rgba(3,6,15,0.998) 72%)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.16) 3px, rgba(255,255,255,0.16) 4px)",
            backgroundSize: "100% 5px",
          }}
        />
        <div
          className="absolute left-1/2 top-[-18rem] h-[38rem] w-[38rem] -translate-x-1/2 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(0,212,255,0.16) 0%, rgba(99,102,241,0.07) 42%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute bottom-[-16rem] right-[-10rem] h-[32rem] w-[32rem] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(168,85,247,0.12), transparent 68%)",
            filter: "blur(55px)",
          }}
        />

        <motion.div
          className="relative w-full max-w-[520px] overflow-hidden rounded-[26px] border border-cyan-300/20 bg-[#09121f]/95 shadow-[0_30px_120px_-28px_rgba(0,212,255,0.38)]"
          initial={{ y: 18, scale: 0.97 }}
          animate={{
            y: isExiting ? -10 : isEntered ? 0 : 18,
            scale: isExiting ? 0.96 : isEntered ? 1 : 0.97,
            transition: {
              duration: isExiting && !prefersReduced ? 2 : prefersReduced ? 0 : 0.8,
              ease: SILK,
            },
          }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
          <div className="absolute inset-x-8 top-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="px-7 pb-7 pt-8 sm:px-9 sm:pb-9 sm:pt-10">
            <div className="mb-7 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10">
                  <div className="absolute inset-0 rounded-2xl bg-cyan-300/10 blur-xl" />
                  <Languages className="relative h-5 w-5 text-cyan-200" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/65">
                    {t("First session")}
                  </p>
                  <p className="mt-1 text-xs text-white/45">{t("Language setup")}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-emerald-200/75">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("Signed in")}
              </div>
            </div>

            <div className="mb-6 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5">
              <p className="truncate text-xs text-white/55">
                {t("Authenticated as")}{" "}
                <span className="font-medium text-white/80">{accountLabel}</span>
              </p>
            </div>

            {step === "prompt" ? (
              <>
                <div className="mb-7">
                  <div className="mb-3 flex items-center gap-2 text-cyan-200/70">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">
                      {t("Make it yours")}
                    </span>
                  </div>
                  <h1
                    id="first-run-language-title"
                    className="text-[clamp(1.65rem,5vw,2.15rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-white"
                  >
                    {t("Choose your language")}
                  </h1>
                  <p
                    id="first-run-language-description"
                    className="mt-3 max-w-[30rem] text-sm leading-6 text-white/55"
                  >
                    {t(
                      "SwitchControl is currently set to English. Would you like to keep English or choose another language?",
                    )}
                  </p>
                </div>

                <div className="grid gap-3">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => finish("en")}
                    disabled={isExiting}
                    className="group flex w-full items-center justify-between rounded-2xl border border-cyan-200/30 bg-cyan-200/[0.12] px-4 py-3.5 text-left transition hover:border-cyan-200/55 hover:bg-cyan-200/[0.18] disabled:cursor-wait disabled:opacity-80"
                    data-testid="button-keep-english"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-white">
                        {t("Keep English")}
                      </span>
                      <span className="mt-1 block text-xs text-white/45">
                        {t("Use English throughout SwitchControl")}
                      </span>
                    </span>
                    <Check className="h-5 w-5 text-cyan-200 transition-transform group-hover:scale-110" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("picker")}
                    disabled={isExiting}
                    className="group flex w-full items-center justify-between rounded-2xl border border-white/[0.1] bg-white/[0.035] px-4 py-3.5 text-left transition hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-80"
                    data-testid="button-choose-another-language"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-white/90">
                        {t("Choose another language")}
                      </span>
                      <span className="mt-1 block text-xs text-white/45">
                        {t("Select from all supported languages")}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white/75" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-5">
                  <button
                    type="button"
                    onClick={() => setStep("prompt")}
                    className="mb-4 text-xs text-cyan-200/65 transition hover:text-cyan-100"
                    data-testid="button-language-back"
                  >
                    ← {t("Back")}
                  </button>
                  <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">
                    {t("Choose another language")}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    {t("Your choice will be saved before onboarding begins.")}
                  </p>
                </div>

                <div className="grid max-h-[min(42vh,340px)] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                  {LOCALES.map((locale) => {
                    const selected = locale.code === selectedLocale;
                    return (
                      <button
                        key={locale.code}
                        type="button"
                        onClick={() => setSelectedLocale(locale.code)}
                        className={`rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-cyan-200/45 bg-cyan-200/[0.13] text-white"
                            : "border-white/[0.08] bg-white/[0.025] text-white/70 hover:border-white/20 hover:bg-white/[0.06]"
                        }`}
                        aria-pressed={selected}
                        data-testid={`language-option-${locale.code}`}
                      >
                        <span className="block truncate text-sm font-medium">
                          {locale.nativeName}
                        </span>
                        <span className="mt-1 block truncate text-[10px] text-white/35">
                          {locale.englishName}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => finish(selectedLocale)}
                  disabled={isExiting}
                  className="mt-5 flex w-full items-center justify-between rounded-2xl border border-cyan-200/30 bg-cyan-200/[0.12] px-4 py-3.5 text-left transition hover:border-cyan-200/55 hover:bg-cyan-200/[0.18] disabled:cursor-wait disabled:opacity-80"
                  data-testid="button-confirm-language"
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">
                      {t("Continue with {language}", { language: selectedMeta.nativeName })}
                    </span>
                    <span className="mt-1 block text-xs text-white/45">
                      {t("This will be your app language")}
                    </span>
                  </span>
                  <Check className="h-5 w-5 text-cyan-200" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
