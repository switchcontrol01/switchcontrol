import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";

export default function Privacy() {
  return (
    <WebsiteShell variant="inner" bgVariant="legal" showFooter={true}>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        <GlassPanel variant="matte" className="p-6 sm:p-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
          <p className="text-white/40 mb-8">Last updated: April 11, 2026</p>

          <div className="prose prose-invert prose-sm max-w-none space-y-8">

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Overview</h2>
              <p className="text-white/50 leading-relaxed">
                SwitchControl collects and uses information only where needed to provide the product, manage accounts, support users, prevent fraud, and maintain security. This policy explains what we collect, why, and how it is handled.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Account data</h2>
              <p className="text-white/50 leading-relaxed mb-2">When you sign in, we store:</p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Your email address</li>
                <li>Your display name, if provided by your authentication provider</li>
                <li>A unique account identifier</li>
                <li>Authentication metadata needed to manage your login session (such as OAuth provider tokens)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. Entitlement and access data</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                We store information about your access state so the product can deliver the correct features. This includes:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Your current plan (Free, Trial, or Premium)</li>
                <li>Trial start date, end date, and duration if a trial has been activated</li>
                <li>Premium activation and payment status</li>
                <li>Whether you have completed onboarding tours or first-time setup flows</li>
                <li>Feature-access flags used to determine what you can see and use</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. App and device activity data</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                To support product functionality, security, and account management, we may record:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>The time of your last login</li>
                <li>The last time the desktop app was active on your device</li>
                <li>Whether the app has been installed and used</li>
                <li>Account or admin activity events relevant to security, support, and fraud prevention</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-2">
                We do not record keystrokes, personal files, clipboard contents, or full browsing history.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. System and telemetry data</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                When using the desktop app, SwitchControl may access hardware and system information to power its optimization, analysis, and advisory features. This includes:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Hardware profile information (CPU, GPU, RAM, storage) used by optimization and advisor features</li>
                <li>Real-time system metrics (CPU load, memory usage, GPU load) displayed in the dashboard</li>
                <li>Diagnostic data used by AI Advisor and BIOS Advisor to generate recommendations</li>
                <li>Network configuration data used by network optimization features</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-2">
                This data is used locally to power the app's features. We collect only what is needed to provide functionality, analysis, and support — and nothing more.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Administrative access</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                Authorized SwitchControl administrators may access account-level data for legitimate operational purposes, including:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Granting or revoking trial or premium access</li>
                <li>Updating subscription or plan status</li>
                <li>Resetting product flags such as onboarding completion</li>
                <li>Processing account deletion requests</li>
                <li>Investigating reports of abuse, fraud, or policy violations</li>
                <li>Providing account support</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-2">
                Administrative actions are logged for accountability and security purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. How we use your data</h2>
              <p className="text-white/50 leading-relaxed mb-2">We use the data we hold to:</p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Create and manage your account</li>
                <li>Deliver the features your plan entitles you to</li>
                <li>Power optimization, advisory, and diagnostic features in the app</li>
                <li>Process and verify payments</li>
                <li>Prevent fraud, abuse, and unauthorized access</li>
                <li>Provide customer and technical support</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Sharing and service providers</h2>
              <p className="text-white/50 leading-relaxed mb-2">We may share data with trusted third parties who help operate the service:</p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li><span className="text-white/70">Payment processors</span> — to complete and verify purchases</li>
                <li><span className="text-white/70">Authentication providers</span> — such as Google, to handle sign-in</li>
                <li><span className="text-white/70">Hosting and infrastructure providers</span> — to run and deliver the service</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-3">
                We do not sell your personal information. We do not share data for advertising purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Cookies and session storage</h2>
              <p className="text-white/50 leading-relaxed">
                We use cookies and session tokens to keep you signed in and maintain your access state across visits. These are limited to what is needed for the service to function.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. Data retention</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                We retain your data for as long as is reasonably necessary for the following purposes:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Delivering and supporting the product</li>
                <li>Maintaining billing and payment records</li>
                <li>Fraud prevention and security</li>
                <li>Fulfilling legal or regulatory obligations</li>
                <li>Resolving disputes or handling support cases</li>
                <li>Maintaining audit records where operationally required</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-2">
                If you request deletion of your account, we will remove your data subject to any legal or security hold requirements.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">11. Security</h2>
              <p className="text-white/50 leading-relaxed">
                We use reasonable technical and organizational safeguards to protect account data. No system is completely immune to risk. If you believe your account has been compromised, contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">12. Your rights and account deletion</h2>
              <p className="text-white/50 leading-relaxed mb-2">
                Depending on your location, you may have rights to:
              </p>
              <ul className="list-disc list-inside text-white/50 space-y-1 ml-2">
                <li>Request a copy of the data we hold about you</li>
                <li>Request corrections to inaccurate data</li>
                <li>Request deletion of your account and associated data</li>
                <li>Object to or restrict certain uses of your data</li>
              </ul>
              <p className="text-white/50 leading-relaxed mt-2">
                To make any of these requests, email us at{" "}
                <a href="mailto:switchcontrol67@gmail.com" className="text-primary hover:underline">
                  switchcontrol67@gmail.com
                </a>
                . We will respond promptly. Note that some data may be retained after deletion where legally or operationally required (for example, billing records or security logs).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">13. Age requirements</h2>
              <p className="text-white/50 leading-relaxed">
                SwitchControl is not intended for use by anyone who cannot legally enter into a binding agreement in their jurisdiction, or who is below the minimum required age without appropriate parental or guardian permission. If you believe a minor has provided personal data without permission, contact us so we can remove it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">14. Contact</h2>
              <p className="text-white/50 leading-relaxed">
                For privacy questions, data requests, or concerns, contact us at{" "}
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
