export interface SignalValue {
  value: string | number | boolean | null;
  source: "electron" | "store" | "browser" | "static";
  error?: string;
}

export interface Signals {
  system: Record<string, SignalValue>;
  network: Record<string, SignalValue>;
  app: Record<string, SignalValue>;
}

export type RuleSeverity = "critical" | "recommended" | "informational";
export type FindingStatus = "pass" | "fail" | "unknown";

export interface RuleFix {
  type: "app_tweak";
  tweakId: string;
  enable: boolean;
}

export interface Rule {
  id: string;
  title: string;
  description: string;
  severity: RuleSeverity;
  maxPoints: number;
  signal: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_contains";
  expected: string | number | boolean;
  failMessage: string;
  passMessage: string;
  fix?: RuleFix;
}

export interface Ruleset {
  version: string;
  rules: Rule[];
}

export interface Finding {
  ruleId: string;
  title: string;
  status: FindingStatus;
  severity: RuleSeverity;
  message: string;
  pointsDeducted: number;
  fix?: RuleFix;
}

export interface SignalsHealth {
  total: number;
  collected: number;
  degraded: boolean;
  errors: string[];
}

export interface AdvisorReport {
  score: number;
  findings: Finding[];
  topFailed: Finding[];
  signalsHealth: SignalsHealth;
  generatedAt: string;
}
