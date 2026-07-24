/**
 * recommendation-helpers.ts — merge static registry recommendations with
 * dynamic hardware-derived overrides.
 *
 * These helpers are the single source of truth for which value/option gets the
 * "Recommended" badge on a slider or preset card. Dynamic overrides (from the
 * server's hardware-aware rule table) take precedence; static registry values
 * are used as fallback when no override exists.
 */

import type { SliderConfig, PresetConfig } from "./tweak-registry";
import type { RecommendationOverride } from "@/hooks/useDynamicRecommendations";

// ── Slider tweaks ─────────────────────────────────────────────────────────────

export interface EffectiveSliderRecommendation {
  recommendedValue?: number;
  /** Human-readable reason for the recommendation, present only on dynamic overrides. */
  reason?: string;
  /** true when this came from the hardware-aware override, false when it is the static registry value. */
  isDynamic: boolean;
  /** Origin of a dynamic recommendation: premium AI layer or the rule table. */
  source?: "ai" | "rules";
}

/**
 * Returns the effective recommended value for a slider tweak, merging a
 * potential dynamic hardware override with the static registry value.
 */
export function getEffectiveSliderRecommendation(
  tweakId: string,
  sliderConfig: SliderConfig,
  overrides: Record<string, RecommendationOverride> | null,
): EffectiveSliderRecommendation {
  const override = overrides?.[tweakId];
  if (override && override.recommendedValue !== undefined) {
    return {
      recommendedValue: override.recommendedValue,
      reason: override.reason,
      isDynamic: true,
      source: override.source ?? "rules",
    };
  }
  return {
    recommendedValue: sliderConfig.recommendedValue,
    reason: undefined,
    isDynamic: false,
  };
}

// ── Preset tweaks ─────────────────────────────────────────────────────────────

export interface EffectivePresetRecommendation {
  recommendedOptionId?: string;
  /** Human-readable reason for the recommendation, present only on dynamic overrides. */
  reason?: string;
  /** true when this came from the hardware-aware override, false when it is the static registry value. */
  isDynamic: boolean;
  /** Origin of a dynamic recommendation: premium AI layer or the rule table. */
  source?: "ai" | "rules";
}

/**
 * Returns the effective recommended option id for a preset tweak, merging a
 * potential dynamic hardware override with the static registry value.
 */
export function getEffectivePresetRecommendation(
  tweakId: string,
  presetConfig: PresetConfig,
  overrides: Record<string, RecommendationOverride> | null,
): EffectivePresetRecommendation {
  const override = overrides?.[tweakId];
  if (override && override.recommendedOptionId !== undefined) {
    return {
      recommendedOptionId: override.recommendedOptionId,
      reason: override.reason,
      isDynamic: true,
      source: override.source ?? "rules",
    };
  }
  return {
    recommendedOptionId: presetConfig.recommendedOptionId,
    reason: undefined,
    isDynamic: false,
  };
}
