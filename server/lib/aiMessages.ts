export const AI_MESSAGES = {
  early: [
    "Your system has several safe optimizations available.",
    "Background latency can still be improved significantly.",
    "Memory usage looks higher than ideal for gaming.",
    "Some startup processes are consuming unnecessary resources.",
    "Network settings could be optimized for lower ping.",
    "Your system has untapped performance potential."
  ],
  mid: [
    "System performance is improving. A few tweaks remain.",
    "Latency consistency is better, but not optimal yet.",
    "You're close to an optimized state.",
    "Most critical optimizations are in place.",
    "Just a few more adjustments for peak performance."
  ],
  optimized: [
    "Your system is fully optimized for gaming.",
    "No additional performance gains detected.",
    "Your PC is tweaked enough - running at peak efficiency.",
    "All recommended optimizations have been applied.",
    "System running at maximum potential. Great job!",
    "Further tweaks would result in diminishing returns."
  ]
};

export const AI_RECOMMENDATIONS = {
  early: [
    { id: "rec-1", action: "Disable Windows Search indexing for game drives", tag: "Safe", category: "storage" },
    { id: "rec-2", action: "Enable Hardware-accelerated GPU scheduling", tag: "Safe", category: "gpu" },
    { id: "rec-3", action: "Disable Superfetch/SysMain for SSD optimization", tag: "Safe", category: "storage" },
    { id: "rec-4", action: "Optimize Windows power plan for Ultimate Performance", tag: "Safe", category: "power" },
    { id: "rec-5", action: "Disable unnecessary startup programs", tag: "Safe", category: "startup" },
    { id: "rec-6", action: "Enable Game Mode in Windows settings", tag: "Safe", category: "gaming" },
    { id: "rec-7", action: "Disable Windows tips and suggestions", tag: "Safe", category: "privacy" },
    { id: "rec-8", action: "Disable background apps running when not in use", tag: "Safe", category: "performance" },
    { id: "rec-9", action: "Disable Xbox Game DVR and broadcasting", tag: "Safe", category: "gaming" },
    { id: "rec-10", action: "Set visual effects to Best Performance", tag: "Safe", category: "performance" },
    { id: "rec-11", action: "Disable transparency effects", tag: "Safe", category: "performance" },
    { id: "rec-12", action: "Optimize NVIDIA Control Panel for performance", tag: "Safe", category: "gpu" },
    { id: "rec-13", action: "Disable Cortana and web search from Start menu", tag: "Safe", category: "privacy" },
    { id: "rec-14", action: "Disable Windows Defender real-time scanning during gaming", tag: "Advanced", category: "security" }
  ],
  mid: [
    { id: "rec-15", action: "Fine-tune network adapter interrupt moderation", tag: "Advanced", category: "network" },
    { id: "rec-16", action: "Adjust virtual memory pagefile settings", tag: "Advanced", category: "memory" },
    { id: "rec-17", action: "Disable fullscreen optimizations for games", tag: "Safe", category: "gaming" },
    { id: "rec-18", action: "Set process priority to High for games", tag: "Advanced", category: "performance" },
    { id: "rec-19", action: "Disable Nagle's algorithm for lower latency", tag: "Advanced", category: "network" },
    { id: "rec-20", action: "Enable MSI mode for GPU and network adapter", tag: "Agent", category: "hardware" },
    { id: "rec-21", action: "Optimize TCP/IP stack parameters", tag: "Advanced", category: "network" },
    { id: "rec-22", action: "Disable USB selective suspend", tag: "Safe", category: "power" },
    { id: "rec-23", action: "Configure GPU driver for maximum performance", tag: "Agent", category: "gpu" },
    { id: "rec-24", action: "Disable Windows Error Reporting service", tag: "Safe", category: "services" }
  ],
  optimized: []
};

export type MessageTier = "early" | "mid" | "optimized";

export interface SystemContext {
  hasNvidiaGpu?: boolean;
  hasAmdGpu?: boolean;
  hasSsd?: boolean;
  ramGb?: number;
  cpuCores?: number;
  tweaksApplied?: number;
}

export function getTierFromTweakCount(tweaksApplied: number): MessageTier {
  if (tweaksApplied < 5) return "early";
  if (tweaksApplied < 12) return "mid";
  return "optimized";
}

export function getRandomMessage(tier: MessageTier): string {
  const messages = AI_MESSAGES[tier];
  return messages[Math.floor(Math.random() * messages.length)];
}

export function getSmartRecommendations(
  tier: MessageTier, 
  systemContext: SystemContext = {},
  count: number = 3
): Array<{ id: string; action: string; tag: string }> {
  if (tier === "optimized") return [];
  
  let recommendations = [...AI_RECOMMENDATIONS[tier]];
  
  if (tier === "early" && recommendations.length < count) {
    recommendations = [...recommendations, ...AI_RECOMMENDATIONS.mid];
  }
  
  if (systemContext.hasNvidiaGpu === false) {
    recommendations = recommendations.filter(r => !r.action.toLowerCase().includes('nvidia'));
  }
  if (systemContext.hasAmdGpu === false) {
    recommendations = recommendations.filter(r => !r.action.toLowerCase().includes('amd'));
  }
  if (systemContext.hasSsd === false) {
    recommendations = recommendations.filter(r => r.category !== 'storage');
  }
  
  const shuffled = [...recommendations].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(({ id, action, tag }) => ({ id, action, tag }));
}

export function getRandomRecommendations(tier: MessageTier, count: number = 3): Array<{ id: string; action: string; tag: string }> {
  return getSmartRecommendations(tier, {}, count);
}
