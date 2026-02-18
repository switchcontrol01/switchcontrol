import type { Signals, Ruleset, Rule, Finding, AdvisorReport, SignalsHealth, SignalValue, FindingStatus } from "./types";

function resolveSignal(signals: Signals, signalPath: string): SignalValue | null {
  const [category, key] = signalPath.split(".");
  if (!category || !key) return null;
  const group = signals[category as keyof Signals];
  if (!group) return null;
  return group[key] || null;
}

function evaluateCondition(actual: string | number | boolean | null, operator: Rule["operator"], expected: string | number | boolean): boolean {
  if (actual === null || actual === undefined) return false;

  switch (operator) {
    case "eq":
      return String(actual).toLowerCase() === String(expected).toLowerCase();
    case "neq":
      return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case "not_contains":
      return !String(actual).toLowerCase().includes(String(expected).toLowerCase());
    default:
      return false;
  }
}

export function evaluate(signals: Signals, ruleset: Ruleset): AdvisorReport {
  let score = 100;
  const findings: Finding[] = [];
  const errors: string[] = [];

  let totalSignals = 0;
  let collectedSignals = 0;

  for (const category of Object.values(signals)) {
    for (const signal of Object.values(category) as SignalValue[]) {
      totalSignals++;
      if (signal.value !== null && !signal.error) {
        collectedSignals++;
      }
      if (signal.error) {
        errors.push(signal.error);
      }
    }
  }

  for (const rule of ruleset.rules) {
    const signal = resolveSignal(signals, rule.signal);
    let status: FindingStatus;
    let message: string;
    let pointsDeducted = 0;

    if (!signal || signal.value === null || signal.error) {
      status = "unknown";
      message = `Could not evaluate: signal unavailable`;
      pointsDeducted = Math.round(rule.maxPoints * 0.25);
    } else {
      const conditionMet = evaluateCondition(signal.value, rule.operator, rule.expected);

      if (conditionMet) {
        status = "pass";
        message = rule.passMessage;
        pointsDeducted = 0;
      } else {
        status = "fail";
        message = rule.failMessage;
        pointsDeducted = rule.maxPoints;
      }
    }

    score -= pointsDeducted;

    findings.push({
      ruleId: rule.id,
      title: rule.title,
      status,
      severity: rule.severity,
      message,
      pointsDeducted,
      fix: status === "fail" ? rule.fix : undefined,
    });
  }

  score = Math.max(0, Math.min(100, score));

  const topFailed = findings
    .filter((f) => f.status === "fail")
    .sort((a, b) => b.pointsDeducted - a.pointsDeducted)
    .slice(0, 5);

  const signalsHealth: SignalsHealth = {
    total: totalSignals,
    collected: collectedSignals,
    degraded: errors.length > 0,
    errors: [...new Set(errors)],
  };

  return {
    score,
    findings,
    topFailed,
    signalsHealth,
    generatedAt: new Date().toISOString(),
  };
}
