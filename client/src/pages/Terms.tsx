import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      <header className="relative z-10 p-4 max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: 2026-01-06</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Overview</h2>
            <p className="text-muted-foreground leading-relaxed">
              SwitchControl provides software and related services intended to help users configure and optimize Windows settings and system preferences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Eligibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              You must be able to form a legal contract in your country. If you are under the required age, you must have permission from a parent or guardian.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. License and access</h2>
            <p className="text-muted-foreground leading-relaxed">
              We grant you a personal, non-transferable, non-exclusive license to use SwitchControl for your own use. You may not resell, sublicense, or share access unless we explicitly allow it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Acceptable use</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">You agree not to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Use the service for illegal activity</li>
              <li>Attempt to reverse engineer, bypass licensing, or exploit the service</li>
              <li>Interfere with the service or other users</li>
              <li>Upload malware or harmful code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. System changes and risk</h2>
            <p className="text-muted-foreground leading-relaxed">
              SwitchControl may change Windows settings, network configuration, and system preferences. You are responsible for using the software carefully. Results vary by hardware, drivers, game settings, ISP, and other factors.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. No guaranteed results</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not guarantee specific outcomes (FPS, ping, input delay, or stability). Any examples or "before/after" visuals are illustrative.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Payments</h2>
            <p className="text-muted-foreground leading-relaxed">
              Prices are shown at checkout. Taxes may apply depending on location and the payment provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Refunds</h2>
            <p className="text-muted-foreground leading-relaxed">
              All sales are final unless required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Third-party services</h2>
            <p className="text-muted-foreground leading-relaxed">
              Some features rely on third parties (payment processors, sign-in providers, hosting). Their terms may also apply.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Intellectual property</h2>
            <p className="text-muted-foreground leading-relaxed">
              All rights in the software, branding, and content belong to SwitchControl.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Limitation of liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, SwitchControl is not liable for indirect, incidental, special, consequential, or punitive damages, or any loss of data, profit, or business arising from use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Changes</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms. Continued use after changes means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">13. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these terms, contact us at{" "}
              <a href="mailto:support@switchcontrol.org" className="text-primary hover:underline">
                support@switchcontrol.org
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
