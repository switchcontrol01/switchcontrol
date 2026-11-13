export { motion, AnimatePresence } from "framer-motion";
export function useMotion() { return { prefersReducedMotion: false }; }
export function useTranslation() { return { t: (key: string) => key }; }
