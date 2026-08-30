import { motion } from "framer-motion";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import {
  LEGAL_LAST_UPDATED,
  TERMS_SECTIONS,
} from "@/lib/legalContent";

export default function Terms() {
  return (
    <WebsiteShell variant="inner" bgVariant="legal" showFooter={true}>
      <motion.main
        className="mx-auto max-w-4xl px-4 py-8 pb-24 sm:px-6 lg:px-8"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <GlassPanel variant="matte" className="p-6 sm:p-10">
          <h1
            className="mb-2 text-3xl font-bold text-[#E6EAF0] md:text-4xl"
            data-testid="text-terms-title"
          >
            Terms of Service
          </h1>
          <p className="mb-8 text-[#6B7380]">
            Last updated: {LEGAL_LAST_UPDATED}
          </p>
          <div className="prose prose-invert prose-sm max-w-none space-y-8">
            {TERMS_SECTIONS.map((section) => (
              <section key={section.title}>
                <h2 className="mb-3 text-xl font-semibold text-[#E6EAF0]">
                  {section.title}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mb-3 leading-relaxed text-[#A0A8B3]"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="ml-2 list-inside list-disc space-y-2 text-[#A0A8B3]">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </GlassPanel>
      </motion.main>
    </WebsiteShell>
  );
}