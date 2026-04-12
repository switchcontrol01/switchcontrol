import { motion } from "framer-motion";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export default function Terms() {
  return (
    <WebsiteShell variant="inner" bgVariant="legal" showFooter={true}>
      <motion.main
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      >
        <GlassPanel variant="matte" className="p-6 sm:p-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" data-testid="text-terms-title">Terms of Service</h1>
          <p className="text-white/40 mb-8">Last updated: April 11, 2026</p>

          <div className="prose prose-invert prose-sm max-w-none space-y-8">

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Overview</h2>
              <p className="text-white/50 leading-relaxed">
                SwitchControl provides software and services designed to help users configure, optimize, and analyze Windows PC settings and system performance. By using SwitchControl, you agree to these terms. If you do not agree, do not use the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Eligibility</h2>
              <p className="text-white/50 leading-relaxed">
                You must be able to form a legally binding agreement in your jurisdiction. If you are below the minimum required age, you must have permission from a parent or guardian. By using SwitchControl, you confirm you meet these requirements.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. Access tiers</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                SwitchControl offers three access states:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-2 ml-2">
                <li><span className="text-white/70">Free</span> — basic access to selected features at no cost</li>
                <li><span className="text-white/70">Trial</span> — temporary access to Premium features for a limited time</li>
                <li><span className="text-white/70">Premium</span> — full feature access, unlocked through purchase</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-3">
                The features available at each tier may change over time. SwitchControl reserves the right to adjust what is included in each plan.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. Free trials</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                If you receive a free trial of Premium features:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Trials are temporary and expire automatically when the trial period ends</li>
                <li>Trial duration may vary and is determined by SwitchControl</li>
                <li>Trials may be granted manually by SwitchControl at its discretion</li>
                <li>A trial does not guarantee continued Premium access after it expires</li>
                <li>When a trial expires, your account reverts to standard Free access unless you have purchased Premium</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. Premium access and licensing</h2>
              <p className="text-white/50 leading-relaxed">
                Purchasing Premium grants you a personal, non-transferable license to access Premium features under the terms in effect at the time of purchase. Pricing, access models, entitlements, and feature sets may change over time. SwitchControl does not guarantee that any specific feature will remain available indefinitely. You may not resell, transfer, or share your access with others unless explicitly permitted.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. License and general access</h2>
              <p className="text-white/50 leading-relaxed">
                SwitchControl grants you a limited, personal, non-exclusive, non-transferable right to use the software and service for your own purposes. All rights not expressly granted are reserved.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. Acceptable use</h2>
              <p className="text-white/50 leading-relaxed mb-2">You agree not to:</p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Use the service for any unlawful purpose</li>
                <li>Attempt to reverse engineer, decompile, or extract the source code or logic of the service</li>
                <li>Attempt to bypass, circumvent, or tamper with entitlement checks, licensing enforcement, or access control systems</li>
                <li>Use automated tools, bots, or scripts to abuse or overload the service</li>
                <li>Interfere with the service or degrade the experience for other users</li>
                <li>Attempt unauthorized access to accounts, systems, or data you do not own</li>
                <li>Upload, transmit, or introduce malware or harmful code</li>
                <li>Misrepresent your identity or account status</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Administrative account actions</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                SwitchControl may take the following actions on any account as part of normal platform operations:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Grant, modify, or revoke access tiers (Free, Trial, Premium)</li>
                <li>Reset product flags such as onboarding status</li>
                <li>Investigate suspected abuse, fraud, or policy violations</li>
                <li>Suspend or terminate access where necessary (see Section 9)</li>
                <li>Process account deletion requests</li>
                <li>Respond to legal, security, or support requirements</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-2">
                These actions are taken only for legitimate operational or security reasons and are logged.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Suspension and termination</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                SwitchControl may suspend or terminate your access — with or without notice — if we reasonably determine that you have:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Violated these Terms of Service</li>
                <li>Engaged in fraudulent, abusive, or deceptive behavior</li>
                <li>Attempted to tamper with or circumvent access controls or entitlement systems</li>
                <li>Posed a security risk to the service or other users</li>
                <li>Used the service in a way that causes harm or legal exposure</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-2">
                If your account is suspended or terminated for cause, you are not entitled to a refund.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. System changes and risk</h2>
              <p className="text-white/50 leading-relaxed">
                SwitchControl may modify Windows settings, system preferences, startup configuration, network parameters, and power profiles depending on the features you use. You are responsible for using the software carefully and understanding what each feature does before applying it. SwitchControl is not responsible for system instability, data loss, or other issues that may arise from applying changes to your system. Always back up important data before using optimization tools.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">11. No guaranteed results</h2>
              <p className="text-white/50 leading-relaxed">
                SwitchControl does not guarantee specific performance outcomes. Results vary based on hardware configuration, installed software, drivers, network conditions, and many other factors outside our control. This includes but is not limited to: FPS, frame time, input latency, ping, network stability, boot speed, and general system responsiveness. AI-generated recommendations and advisor outputs are provided as informational guidance only — they are not guaranteed to be accurate or suitable for every system.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">12. Payments and refunds</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                All pricing is shown at checkout before you complete a purchase. Payments are handled securely by our third-party payment processor.
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>All sales are final unless a refund is expressly offered by SwitchControl or required by applicable law</li>
                <li>Taxes may apply based on your location and the payment provider's rules</li>
                <li>If you believe a charge is in error, contact us promptly</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">13. Third-party services</h2>
              <p className="text-white/50 leading-relaxed">
                Some features rely on third-party providers including payment processors, authentication services, and hosting infrastructure. Their terms and privacy policies may also apply to your use of those services. SwitchControl is not responsible for the conduct or policies of third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">14. Intellectual property</h2>
              <p className="text-white/50 leading-relaxed">
                All rights in the SwitchControl software, brand, design, content, and services are owned by SwitchControl. Nothing in these terms transfers any ownership to you. You may not reproduce, distribute, or create derivative works from any part of SwitchControl without explicit written permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">15. Limitation of liability</h2>
              <p className="text-white/50 leading-relaxed">
                To the fullest extent permitted by law, SwitchControl is not liable for indirect, incidental, special, consequential, or punitive damages — including but not limited to loss of data, loss of profit, or system damage — arising from your use of, or inability to use, the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">16. Changes to the service and these terms</h2>
              <p className="text-white/50 leading-relaxed">
                SwitchControl may update features, pricing, access tiers, and service structure at any time. We may also update these terms and our Privacy Policy. When we make material changes, we will update the "Last updated" date. Continued use of the service after changes take effect constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">17. Contact</h2>
              <p className="text-white/50 leading-relaxed">
                For questions about these terms, contact us at{" "}
                <a href="mailto:switchcontrol67@gmail.com" className="text-primary hover:underline">
                  switchcontrol67@gmail.com
                </a>
              </p>
            </section>

          </div>
        </GlassPanel>
      </motion.main>
    </WebsiteShell>
  );
}
