import { motion } from "framer-motion";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import {
  LEGAL_LAST_UPDATED,
  getLocalizedLegalSections,
} from "@/lib/legalContent";
import { useTranslation } from "@/lib/i18n";

export default function Terms() {
  const { t, language } = useTranslation();
  const { terms } = getLocalizedLegalSections(language);

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
            {t("Terms of Service")}
          </h1>
          <p className="mb-8 text-[#6B7380]">
            {t("Last updated:")} {LEGAL_LAST_UPDATED}
          </p>
          <div className="prose prose-invert prose-sm max-w-none space-y-8">
            {terms.map((section) => (
              <section key={section.title}>
                <h2 className="mb-3 text-xl font-semibold text-[#E6EAF0]">
                  {t(section.title)}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mb-3 leading-relaxed text-[#A0A8B3]"
                  >
                    {t(paragraph)}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="ml-2 list-inside list-disc space-y-2 text-[#A0A8B3]">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{t(bullet)}</li>
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