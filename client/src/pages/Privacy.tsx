import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";

export default function Privacy() {
  return (
    <WebsiteShell variant="inner" showFooter={true}>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        <GlassPanel variant="matte" className="p-6 sm:p-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
          <p className="text-white/40 mb-8">Last updated: 2026-01-06</p>

          <div className="prose prose-invert prose-sm max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. What we collect</h2>
              <p className="text-white/50 leading-relaxed mb-2">We may collect:</p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Account information (email, name) if you sign in</li>
                <li>Purchase metadata (payment status) from our payment provider</li>
                <li>Basic analytics (pages visited, device/browser info) to improve the site</li>
                <li>Diagnostic events you choose to send for troubleshooting</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. What we do not collect</h2>
              <p className="text-white/50 leading-relaxed mb-2">We do not intentionally collect:</p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Personal files</li>
                <li>Keystrokes</li>
                <li>Full browsing history</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. How we use data</h2>
              <p className="text-white/50 leading-relaxed mb-2">We use information to:</p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Create and manage accounts</li>
                <li>Provide access to purchased features</li>
                <li>Improve reliability and user experience</li>
                <li>Prevent fraud and abuse</li>
                <li>Provide customer support</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. Sharing</h2>
              <p className="text-white/50 leading-relaxed mb-2">We may share data with:</p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Payment processors to complete transactions</li>
                <li>Authentication providers (if you use Google sign-in)</li>
                <li>Hosting/analytics providers to operate the site</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-2">
                We do not sell your personal information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. Cookies</h2>
              <p className="text-white/50 leading-relaxed">
                We use cookies or similar storage for login sessions and essential site features.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Data retention</h2>
              <p className="text-white/50 leading-relaxed">
                We keep data only as long as necessary for the purposes above, unless the law requires longer retention.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. Security</h2>
              <p className="text-white/50 leading-relaxed">
                We use reasonable safeguards, but no system is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Your rights</h2>
              <p className="text-white/50 leading-relaxed">
                Depending on your location, you may have rights to access, correct, delete, or export your data. Contact us to make a request.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Children</h2>
              <p className="text-white/50 leading-relaxed">
                The service is not intended for young children. If you believe a child provided data, contact us to remove it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. Contact</h2>
              <p className="text-white/50 leading-relaxed">
                For privacy questions or data requests, contact us at{" "}
                <a href="mailto:switchcontrol67@gmail.com" className="text-primary hover:underline">
                  switchcontrol67@gmail.com
                </a>
              </p>
            </section>
          </div>
        </GlassPanel>
      </main>
    </WebsiteShell>
  );
}
