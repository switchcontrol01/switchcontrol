import { useEffect, useState } from "react";
import { AI_AVAILABILITY_EVENT, getAiUnavailable } from "@/lib/ai-availability";

export function useAiAvailability() {
  const [unavailable, setUnavailable] = useState(getAiUnavailable);
  useEffect(() => {
    const update = () => setUnavailable(getAiUnavailable());
    window.addEventListener(AI_AVAILABILITY_EVENT, update);
    window.addEventListener("storage", update);
    const timeout = unavailable ? setTimeout(update, Math.max(1, unavailable.until - Date.now() + 20)) : undefined;
    return () => {
      window.removeEventListener(AI_AVAILABILITY_EVENT, update);
      window.removeEventListener("storage", update);
      if (timeout) clearTimeout(timeout);
    };
  }, [unavailable?.until]);
  return unavailable;
}
