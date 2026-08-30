import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileCheck2,
  LockKeyhole,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useMotion } from "@/lib/motionTokens";
import {
  LEGAL_LAST_UPDATED,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  type LegalSection,
} from "@/lib/legalContent";
import {
  FIRST_RUN_TRANSITION_MS,
  firstRunTransition,
  firstRunVisualExit,
  firstRunVisualInitial,
  firstRunVisualVisible,
} from "@/lib/firstRunTransition";
import { useTranslation } from "@/lib/i18n";

export const TERMS_CONSENT_KEY = "sc_terms_consent_seen_";
const ENTER_DELAY_MS = 40;
const BOTTOM_THRESHOLD_PX = 12;

interface Props {
  userId: string;
  onComplete: () => void;
  onDecline: () => void;
  onTransitionStart?: () => void;
}

function LegalSectionView({
  section,
  t,
}: {
  section: LegalSection;
  t: (key: string) => string;
}) {
  return (
    <section className="space-y-2" data-testid="consent-legal-section">
      <h3 className="text-sm font-semibold tracking-tight text-white/90">
        {t(section.title)}
      </h3>
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className="text-[12px] leading-[1.65] text-white/60">
          {t(paragraph)}
        </p>
      ))}
      {section.bullets && (
        <ul className="ml-4 list-disc space-y-1.5 text-[12px] leading-[1.55] text-white/60">
          {section.bullets.map((bullet) => (
            <li key={bullet}>{t(bullet)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FirstRunConsent({
  userId,
  onComplete,
  onDecline,
  onTransitionStart,
}: Props) {
  const { t } = useTranslation();
  const { prefersReducedMotion } = useMotion();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const completeRef = useRef(onComplete);
  const [isEntered, setIsEntered] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [persistenceError, setPersistenceError] = useState(false);

  completeRef.current = onComplete;

  const checkScrollPosition = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const scrollableDistance = element.scrollHeight - element.clientHeight;
    const progress =
      scrollableDistance <= 0
        ? 1
        : Math.min(1, Math.max(0, element.scrollTop / scrollableDistance));
    setScrollProgress(progress);
    const reachedBottom =
      element.scrollTop + element.clientHeight >=
      element.scrollHeight - BOTTOM_THRESHOLD_PX;
    setIsAtBottom(reachedBottom);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setIsEntered(true),
      prefersReducedMotion ? 0 : ENTER_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    checkScrollPosition();
    const observer = new ResizeObserver(checkScrollPosition);
    observer.observe(element);
    return () => observer.disconnect();
  }, [checkScrollPosition]);

  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    },
    [],
  );

  const accept = () => {
    if (!isAtBottom || isExiting || isDeclining) return;
    // This write is intentionally completed before the exit begins. The key is
    // account-scoped so a different authenticated account gets its own gate.
    try {
      localStorage.setItem(`${TERMS_CONSENT_KEY}${userId}`, "true");
    } catch {
      setPersistenceError(true);
      return;
    }
    setIsExiting(true);
    onTransitionStart?.();
    exitTimerRef.current = window.setTimeout(
      () => completeRef.current(),
      prefersReducedMotion ? 0 : FIRST_RUN_TRANSITION_MS,
    );
  };

  const decline = () => {
    if (isExiting || isDeclining) return;
    setIsDeclining(true);
    exitTimerRef.current = window.setTimeout(
      onDecline,
      prefersReducedMotion ? 0 : FIRST_RUN_TRANSITION_MS,
    );
  };

  const greenProgress = isAtBottom ? 1 : scrollProgress;
  const agreeButtonStyle = {
    background: isAtBottom
      ? "linear-gradient(135deg, rgba(52,211,153,0.30), rgba(16,185,129,0.24))"
      : `linear-gradient(135deg, rgba(52,211,153,${0.035 + greenProgress * 0.19}), rgba(16,185,129,${0.025 + greenProgress * 0.15}))`,
    borderColor: `rgba(110,231,183,${0.1 + greenProgress * 0.38})`,
    color: isAtBottom
      ? "rgba(209,250,229,1)"
      : `rgba(209,250,229,${0.28 + greenProgress * 0.56})`,
    boxShadow: isAtBottom
      ? "0 0 24px rgba(52,211,153,0.22), inset 0 1px 0 rgba(255,255,255,0.10)"
      : `0 0 ${8 + greenProgress * 16}px rgba(52,211,153,${greenProgress * 0.18}), inset 0 1px 0 rgba(255,255,255,${greenProgress * 0.07})`,
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden px-4 py-5 sm:px-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-consent-title"
        aria-describedby="first-run-consent-description"
        data-testid="first-run-consent"
        data-animation-state={
          isExiting || isDeclining
            ? "exiting"
            : isEntered
              ? "entered"
              : "entering"
        }
        {...firstRunVisualInitial()}
        animate={{
          ...(isEntered && !isExiting && !isDeclining
            ? firstRunVisualVisible()
            : firstRunVisualExit()),
          transition: firstRunTransition(prefersReducedMotion),
        }}
        data-first-run-transition="consent"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_90%_at_50%_0%,rgba(4,19,36,0.985)_0%,rgba(3,6,15,0.998)_72%)] backdrop-blur-[22px]" />
        <div className="absolute inset-0 pointer-events-none opacity-[0.035] [background-image:repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(255,255,255,0.16)_3px,rgba(255,255,255,0.16)_4px)]" />

        <motion.div
          className="relative flex w-full max-w-[720px] flex-col overflow-hidden rounded-[24px] border border-cyan-300/20 bg-[#09121f]/95 shadow-[0_30px_120px_-28px_rgba(0,212,255,0.38)]"
          initial={{ y: 20, scale: 0.97 }}
          animate={{
            y: isExiting || isDeclining ? -10 : isEntered ? 0 : 20,
            scale: isExiting || isDeclining ? 0.96 : isEntered ? 1 : 0.97,
            transition: firstRunTransition(prefersReducedMotion),
          }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
          <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10">
                <FileCheck2 className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/65">
                  {t("Required first step")}
                </p>
                <h1
                  id="first-run-consent-title"
                  className="mt-1 text-[clamp(1.35rem,4vw,1.85rem)] font-semibold leading-tight tracking-[-0.035em] text-white"
                >
                  {t("Review before you optimize")}
                </h1>
                <p
                  id="first-run-consent-description"
                  className="mt-2 max-w-[55ch] text-sm leading-relaxed text-white/55"
                >
                  {t("Read the Terms of Service and Privacy Policy, then scroll to the end to continue with SwitchControl.")}
                </p>
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-emerald-200/75 sm:flex">
              <LockKeyhole className="h-3 w-3" />
              {t("Signed in")}
            </div>
          </div>

          <div className="mx-5 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-2.5 sm:mx-7">
            <span className="text-[11px] text-white/50">
              {t("Last updated:")} {LEGAL_LAST_UPDATED}
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <a
                href="https://switchcontrol.org/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-cyan-200/75 underline underline-offset-2 transition hover:text-cyan-100"
              >
                {t("Terms")} <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://switchcontrol.org/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-cyan-200/75 underline underline-offset-2 transition hover:text-cyan-100"
              >
                {t("Privacy")} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div
            ref={scrollRef}
            onScroll={checkScrollPosition}
            tabIndex={0}
            role="document"
            aria-label={t("Terms of Service and Privacy Policy")}
            data-testid="first-run-consent-scroll"
            className="mx-5 mt-4 max-h-[min(48vh,440px)] overflow-y-auto rounded-xl border border-white/[0.08] bg-black/20 px-4 py-5 outline-none transition focus:border-cyan-300/35 sm:mx-7 sm:px-6"
          >
            <div className="space-y-7">
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-cyan-100/90">
                  {t("Terms of Service")}
                </h2>
                {TERMS_SECTIONS.map((section) => (
                  <LegalSectionView key={section.title} section={section} t={t} />
                ))}
              </div>
              <div className="h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <div className="space-y-5">
                <h2 className="text-base font-semibold text-cyan-100/90">
                  {t("Privacy Policy")}
                </h2>
                {PRIVACY_SECTIONS.map((section) => (
                  <LegalSectionView key={section.title} section={section} t={t} />
                ))}
              </div>
              <p className="border-t border-white/[0.08] pt-5 text-[11px] leading-relaxed text-white/40">
                 {t("By selecting Agree, you confirm that you have reviewed both documents and agree to the Terms of Service and Privacy Policy.")}
              </p>
            </div>
          </div>

          <div className="px-5 pb-5 pt-4 sm:px-7 sm:pb-6">
            <div className="mb-3 flex items-center gap-2 text-[11px]">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300/70 to-emerald-300"
                  animate={{ width: isAtBottom ? "100%" : "28%" }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                />
              </div>
              <span className={isAtBottom ? "text-emerald-300/90" : "text-white/40"}>
                {isAtBottom ? t("Ready to agree") : t("Scroll to continue")}
              </span>
              {!isAtBottom && <ChevronDown className="h-3.5 w-3.5 animate-bounce text-white/35" />}
            </div>
            {persistenceError && (
              <p
                className="mb-3 rounded-lg border border-red-400/25 bg-red-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-red-200/80"
                role="alert"
              >
                {t("We could not save your consent. Check browser storage access and try again.")}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={decline}
                disabled={isExiting || isDeclining}
                data-testid="button-first-run-consent-decline"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.06] px-4 py-3 text-xs font-semibold text-red-300/85 transition hover:border-red-300/45 hover:bg-red-400/[0.12] disabled:cursor-wait disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                {t("Decline & quit")}
              </button>
              <button
                type="button"
                onClick={accept}
                disabled={!isAtBottom || isExiting || isDeclining}
                data-testid="button-first-run-consent-agree"
                className={`inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-xs font-semibold transition-all duration-300 ${
                  isAtBottom
                    ? "hover:bg-emerald-300/[0.38]"
                    : "cursor-not-allowed"
                }`}
                style={agreeButtonStyle}
              >
                <Check className="h-3.5 w-3.5" />
                {t("Agree & continue")}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}