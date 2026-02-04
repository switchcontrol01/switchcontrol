export const AI_MESSAGES = {
  early: [
    "Your system has several safe optimizations left.",
    "Background latency can still be improved.",
    "Memory usage looks higher than ideal for gaming.",
    "Some startup processes are consuming resources.",
    "Network settings could be optimized for lower ping."
  ],
  mid: [
    "System performance is improving. A few tweaks remain.",
    "Latency consistency is better, but not optimal yet.",
    "You're close to an optimized state.",
    "Most critical optimizations are in place.",
    "Just a few more adjustments for peak performance."
  ],
  optimized: [
    "Your system is well optimized.",
    "No major performance gains detected.",
    "Further tweaks may result in diminishing returns.",
    "System running at peak efficiency.",
    "All recommended optimizations have been applied."
  ]
};

export const AI_RECOMMENDATIONS = {
  early: [
    { id: "rec-1", action: "Disable Windows Search indexing for game drives", tag: "Safe" },
    { id: "rec-2", action: "Enable Hardware-accelerated GPU scheduling", tag: "Safe" },
    { id: "rec-3", action: "Disable Superfetch for SSD optimization", tag: "Advanced" },
    { id: "rec-4", action: "Optimize Windows power plan for gaming", tag: "Safe" },
    { id: "rec-5", action: "Disable unnecessary startup programs", tag: "Safe" },
    { id: "rec-6", action: "Enable Game Mode in Windows settings", tag: "Safe" }
  ],
  mid: [
    { id: "rec-7", action: "Fine-tune network adapter settings", tag: "Advanced" },
    { id: "rec-8", action: "Adjust virtual memory settings", tag: "Advanced" },
    { id: "rec-9", action: "Disable fullscreen optimizations", tag: "Safe" },
    { id: "rec-10", action: "Optimize GPU driver settings", tag: "Requires local agent" }
  ],
  optimized: []
};

export type MessageTier = "early" | "mid" | "optimized";

export function getTierFromTweakCount(tweaksApplied: number): MessageTier {
  if (tweaksApplied < 5) return "early";
  if (tweaksApplied < 10) return "mid";
  return "optimized";
}

export function getRandomMessage(tier: MessageTier): string {
  const messages = AI_MESSAGES[tier];
  return messages[Math.floor(Math.random() * messages.length)];
}

export function getRandomRecommendations(tier: MessageTier, count: number = 3): Array<{ id: string; action: string; tag: string }> {
  const recommendations = AI_RECOMMENDATIONS[tier];
  if (recommendations.length === 0) return [];
  
  const shuffled = [...recommendations].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
