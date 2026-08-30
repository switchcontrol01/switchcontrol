export interface StorageOptimizationRecord {
  drive_letter: string;
  optimize_type: string;
  status: string;
  ran_at: string;
}

export interface WindowsOptimizationState {
  scheduleEnabled: boolean | null;
  status: "available" | "failed" | "unavailable";
  source: "windows-scheduled-task";
}

interface DriveForRecommendation {
  letter: string;
  mediaType: string;
  busType: string;
  trimEnabled: boolean;
  optimization?: WindowsOptimizationState | null;
}

export interface StorageOptimizationRecommendation {
  action: string;
  duration: string;
  urgency: "low" | "medium" | "high";
  days: number | null;
  optimizeType: "trim" | "defrag";
  due: boolean;
  lastRunAt: string | null;
  lastRunSource: "windows" | "switchcontrol" | null;
  lastRunLabel: string;
  reason: string;
}

function validTimestamp(value: string | null | undefined, nowMs = Date.now()): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= nowMs + 5 * 60_000
    ? timestamp
    : null;
}

export function isHddForOptimization(drive: Pick<DriveForRecommendation, "mediaType" | "busType">): boolean {
  const mediaType = drive.mediaType?.toLowerCase() ?? "";
  const busType = drive.busType?.toLowerCase() ?? "";
  return mediaType === "hdd" ||
    (mediaType !== "ssd" && mediaType !== "nvme" && busType !== "nvme" && mediaType !== "unknown" && mediaType !== "");
}

export function getStorageOptimizationRecommendation(
  drive: DriveForRecommendation,
  history: StorageOptimizationRecord[],
  nowMs = Date.now(),
): StorageOptimizationRecommendation {
  const isHdd = isHddForOptimization(drive);
  const optimizeType = isHdd ? "defrag" : "trim";
  const operationLabel = isHdd ? "Defragmentation" : "TRIM";

  const appRecord = history.find((record) =>
    record.drive_letter?.toUpperCase() === drive.letter.toUpperCase() &&
    record.optimize_type === optimizeType &&
    record.status === "success" &&
    validTimestamp(record.ran_at, nowMs) !== null,
  );
  const appTimestamp = validTimestamp(appRecord?.ran_at, nowMs);

  const windowsState = drive.optimization;
  const lastRunTimestamp = appTimestamp;
  const lastRunSource: StorageOptimizationRecommendation["lastRunSource"] =
    appTimestamp === null ? null : "switchcontrol";

  const days = lastRunTimestamp === null
    ? null
    : Math.max(0, Math.floor((nowMs - lastRunTimestamp) / 86_400_000));

  if (!isHdd && !drive.trimEnabled) {
    return {
      action: "TRIM is disabled in Windows",
      duration: "< 5 sec",
      urgency: "high",
      days,
      optimizeType,
      due: false,
      lastRunAt: lastRunTimestamp === null ? null : new Date(lastRunTimestamp).toISOString(),
      lastRunSource,
      lastRunLabel: lastRunSource === "switchcontrol" ? "SwitchControl" : "Unavailable",
      reason: "Running ReTrim is not useful until Windows delete notifications are enabled for this SSD.",
    };
  }

  if (days !== null && days <= 14) {
    return {
      action: `${operationLabel} is up to date`,
      duration: isHdd ? "5–15 min" : "< 5 sec",
      urgency: "low",
      days,
      optimizeType,
      due: false,
      lastRunAt: new Date(lastRunTimestamp).toISOString(),
      lastRunSource,
      lastRunLabel: "SwitchControl",
      reason: "A successful SwitchControl run was recorded within the last 14 days.",
    };
  }

  if (days !== null && days <= 30) {
    return {
      action: `${operationLabel} maintenance is due soon`,
      duration: isHdd ? "5–15 min" : "< 5 sec",
      urgency: "medium",
      days,
      optimizeType,
      due: false,
      lastRunAt: new Date(lastRunTimestamp).toISOString(),
      lastRunSource,
      lastRunLabel: "SwitchControl",
      reason: "Windows normally handles drive optimization automatically; there is no need to run it on every app launch.",
    };
  }

  if (windowsState?.scheduleEnabled === true) {
    return {
      action: "Windows automatic optimization is enabled",
      duration: isHdd ? "5–15 min" : "< 5 sec",
      urgency: "low",
      days,
      optimizeType,
      due: false,
      lastRunAt: lastRunTimestamp === null ? null : new Date(lastRunTimestamp).toISOString(),
      lastRunSource,
      lastRunLabel: lastRunSource === "switchcontrol" ? "SwitchControl" : "Unavailable",
      reason: "The Windows maintenance schedule is enabled, but its global task history is not treated as proof that this specific drive ran.",
    };
  }

  if (days !== null) {
    return {
      action: `${operationLabel} optimization recommended`,
      duration: isHdd ? "5–15 min" : "< 5 sec",
      urgency: "high",
      days,
      optimizeType,
      due: true,
      lastRunAt: new Date(lastRunTimestamp).toISOString(),
      lastRunSource,
      lastRunLabel: "SwitchControl",
      reason: `No successful optimization has been recorded for ${days} days.`,
    };
  }

  const scheduleEnabled = windowsState?.scheduleEnabled === true;
  return {
    action: scheduleEnabled ? "Windows automatic optimization is enabled" : `${operationLabel} status unavailable`,
    duration: isHdd ? "5–15 min" : "< 5 sec",
    urgency: scheduleEnabled ? "low" : "medium",
    days: null,
    optimizeType,
    due: false,
    lastRunAt: null,
    lastRunSource: null,
    lastRunLabel: "Unavailable",
    reason: scheduleEnabled
      ? "SwitchControl could not confirm the last run time, so it will not claim optimization is due."
      : "SwitchControl could not verify a successful Windows or SwitchControl optimization run.",
  };
}