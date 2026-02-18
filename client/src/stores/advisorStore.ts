import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Signals, AdvisorReport, Ruleset } from "../advisor/types";
import { collectSystemSignals } from "../advisor/collectors/systemCollector";
import { collectNetworkSignals } from "../advisor/collectors/networkCollector";
import { collectAppSignals } from "../advisor/collectors/appCollector";
import { evaluate } from "../advisor/engine";
import bundledRuleset from "../advisor/ruleset/bundled.ruleset.json";

export type AdvisorRunState =
  | "idle"
  | "initializing"
  | "collecting"
  | "evaluating"
  | "ready"
  | "degraded"
  | "error";

interface AdvisorState {
  runState: AdvisorRunState;
  report: AdvisorReport | null;
  lastRunAt: string | null;
  error: string | null;
  _signals: Signals | null;

  runAdvisor: (appContext: {
    tweaks: Record<string, boolean>;
    account: { stats: { tweaksApplied: number; lastScan: string | null } };
    isPremium: boolean;
    userId: string;
  }) => Promise<void>;

  reRunAdvisor: (appContext: {
    tweaks: Record<string, boolean>;
    account: { stats: { tweaksApplied: number; lastScan: string | null } };
    isPremium: boolean;
    userId: string;
  }) => Promise<void>;

  clearAdvisor: () => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useAdvisorStore = create<AdvisorState>()(
  persist(
    (set, get) => ({
      runState: "idle",
      report: null,
      lastRunAt: null,
      error: null,
      _signals: null,

      runAdvisor: async (appContext) => {
        try {
          set({ runState: "initializing", error: null });
          await delay(600);

          set({ runState: "collecting" });

          const [systemSignals, networkSignals] = await Promise.all([
            collectSystemSignals(),
            collectNetworkSignals(),
          ]);
          const appSignals = collectAppSignals(appContext);

          const signals: Signals = {
            system: systemSignals,
            network: networkSignals,
            app: appSignals,
          };

          set({ runState: "evaluating" });
          await delay(400);

          const report = evaluate(signals, bundledRuleset as Ruleset);
          const now = new Date().toISOString();

          if (report.signalsHealth.degraded) {
            set({
              runState: "degraded",
              report,
              lastRunAt: now,
              _signals: signals,
            });
          } else {
            set({
              runState: "ready",
              report,
              lastRunAt: now,
              _signals: signals,
            });
          }
        } catch (err: any) {
          set({
            runState: "error",
            error: err?.message || "Advisor failed unexpectedly",
          });
        }
      },

      reRunAdvisor: async (appContext) => {
        const state = get();
        if (state.runState !== "ready" && state.runState !== "degraded") {
          return state.runAdvisor(appContext);
        }

        set({ runState: "evaluating" });

        const [systemSignals, networkSignals] = await Promise.all([
          collectSystemSignals(),
          collectNetworkSignals(),
        ]);
        const appSignals = collectAppSignals(appContext);

        const signals: Signals = {
          system: systemSignals,
          network: networkSignals,
          app: appSignals,
        };

        await delay(300);

        const report = evaluate(signals, bundledRuleset as Ruleset);
        const now = new Date().toISOString();

        if (report.signalsHealth.degraded) {
          set({ runState: "degraded", report, lastRunAt: now, _signals: signals });
        } else {
          set({ runState: "ready", report, lastRunAt: now, _signals: signals });
        }
      },

      clearAdvisor: () =>
        set({
          runState: "idle",
          report: null,
          lastRunAt: null,
          error: null,
          _signals: null,
        }),
    }),
    {
      name: "sc-advisor-store",
      partialize: (state) => ({
        report: state.report,
        lastRunAt: state.lastRunAt,
        runState:
          state.runState === "ready" || state.runState === "degraded"
            ? state.runState
            : "idle",
      }),
      version: 1,
    }
  )
);
