export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export const LEGAL_LAST_UPDATED = "April 11, 2026";

// These sections are shared by the public legal pages and the authenticated
// first-run consent gate. Keep the wording here in sync with the published
// documents; the consent gate is not a separate or abbreviated agreement.
export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. Overview",
    paragraphs: [
      "SwitchControl provides software and services designed to help users configure, optimize, and analyze Windows PC settings and system performance. By using SwitchControl, you agree to these terms. If you do not agree, do not use the service.",
    ],
  },
  {
    title: "2. Eligibility",
    paragraphs: [
      "You must be able to form a legally binding agreement in your jurisdiction. If you are below the minimum required age, you must have permission from a parent or guardian. By using SwitchControl, you confirm you meet these requirements.",
    ],
  },
  {
    title: "3. Access tiers",
    paragraphs: [
      "SwitchControl offers three access states: Free, basic access to selected features at no cost; Trial, temporary access to Premium features for a limited time; and Premium, full feature access, unlocked through purchase. The features available at each tier may change over time. SwitchControl reserves the right to adjust what is included in each plan.",
    ],
  },
  {
    title: "4. Free trials",
    paragraphs: ["If you receive a free trial of Premium features:"],
    bullets: [
      "Trials are temporary and expire automatically when the trial period ends",
      "Trial duration may vary and is determined by SwitchControl",
      "Trials may be granted manually by SwitchControl at its discretion",
      "A trial does not guarantee continued Premium access after it expires",
      "When a trial expires, your account reverts to standard Free access unless you have purchased Premium",
    ],
  },
  {
    title: "5. Premium access and licensing",
    paragraphs: [
      "Purchasing Premium grants you a personal, non-transferable license to access Premium features under the terms in effect at the time of purchase. Pricing, access models, entitlements, and feature sets may change over time. SwitchControl does not guarantee that any specific feature will remain available indefinitely. You may not resell, transfer, or share your access with others unless explicitly permitted.",
    ],
  },
  {
    title: "6. License and general access",
    paragraphs: [
      "SwitchControl grants you a limited, personal, non-exclusive, non-transferable right to use the software and service for your own purposes. All rights not expressly granted are reserved.",
    ],
  },
  {
    title: "7. Acceptable use",
    paragraphs: ["You agree not to:"],
    bullets: [
      "Use the service for any unlawful purpose",
      "Attempt to reverse engineer, decompile, or extract the source code or logic of the service",
      "Attempt to bypass, circumvent, or tamper with entitlement, licensing, or access control systems",
      "Use automated tools, bots, or scripts to abuse or overload the service",
      "Interfere with the service or degrade the experience for other users",
      "Attempt unauthorized access to accounts, systems, or data you do not own",
      "Upload, transmit, or introduce malware or harmful code",
      "Misrepresent your identity or account status",
    ],
  },
  {
    title: "8. Administrative account actions",
    paragraphs: [
      "SwitchControl may take the following actions on any account as part of normal platform operations:",
    ],
    bullets: [
      "Grant, modify, or revoke access tiers (Free, Trial, Premium)",
      "Reset product flags such as onboarding status",
      "Investigate suspected abuse, fraud, or policy violations",
      "Suspend or terminate access where necessary (see Section 9)",
      "Process account deletion requests",
      "Respond to legal, security, or support requirements",
      "These actions are taken only for legitimate operational or security reasons and are logged.",
    ],
  },
  {
    title: "9. Suspension and termination",
    paragraphs: [
      "SwitchControl may suspend or terminate your access, with or without notice, if we reasonably determine that you have violated these Terms of Service, engaged in fraudulent, abusive, or deceptive behavior, attempted to tamper with or circumvent access controls or entitlement systems, posed a security risk to the service or other users, or used the service in a way that causes harm or legal exposure. If your account is suspended or terminated for cause, you are not entitled to a refund.",
    ],
  },
  {
    title: "10. System changes and risk",
    paragraphs: [
      "SwitchControl may modify Windows settings, system preferences, startup configuration, network parameters, and power profiles depending on the features you use. You are responsible for using the software carefully and understanding what each feature does before applying it. SwitchControl is not responsible for system instability, data loss, or other issues that may arise from applying changes to your system. Always back up important data before using optimization tools.",
    ],
  },
  {
    title: "11. No guaranteed results",
    paragraphs: [
      "SwitchControl does not guarantee specific performance outcomes. Results vary based on hardware configuration, installed software, drivers, network conditions, and many other factors outside our control. This includes but is not limited to: FPS, frame time, input latency, ping, network stability, boot speed, and general system responsiveness. AI-generated recommendations and advisor outputs are provided as informational guidance only, they are not guaranteed to be accurate or suitable for every system.",
    ],
  },
  {
    title: "12. Payments and refunds",
    paragraphs: [
      "All pricing is shown at checkout before you complete a purchase. Payments are handled securely by our third-party payment processor.",
    ],
    bullets: [
      "All sales are final unless a refund is expressly offered by SwitchControl or required by applicable law",
      "Taxes may apply based on your location and the payment provider's rules",
      "If you believe a charge is in error, contact us promptly",
    ],
  },
  {
    title: "13. Third-party services",
    paragraphs: [
      "Some features rely on third-party providers including payment processors, authentication services, and hosting infrastructure. Their terms and privacy policies may also apply to your use of those services. SwitchControl is not responsible for the conduct or policies of third parties.",
    ],
  },
  {
    title: "14. Intellectual property",
    paragraphs: [
      "All rights in the SwitchControl software, brand, design, content, and services are owned by SwitchControl. Nothing in these terms transfers any ownership to you. You may not reproduce, distribute, or create derivative works from any part of SwitchControl without explicit written permission.",
    ],
  },
  {
    title: "15. Limitation of liability",
    paragraphs: [
      "To the fullest extent permitted by law, SwitchControl is not liable for indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, loss of profit, or system damage, arising from your use of, or inability to use, the service.",
    ],
  },
  {
    title: "16. Changes to the service and these terms",
    paragraphs: [
      "SwitchControl may update features, pricing, access tiers, and service structure at any time. We may also update these terms and our Privacy Policy. When we make material changes, we will update the “Last updated” date. Continued use of the service after changes take effect constitutes acceptance of the updated terms.",
    ],
  },
  {
    title: "17. Contact",
    paragraphs: [
      "For questions about these terms, contact us at switchcontrol67@gmail.com",
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "1. Overview",
    paragraphs: [
      "SwitchControl collects and uses information only where needed to provide the product, manage accounts, support users, prevent fraud, and maintain security. This policy explains what we collect, why, and how it is handled.",
    ],
  },
  {
    title: "2. Account data",
    paragraphs: ["When you sign in, we store:"],
    bullets: [
      "Your email address",
      "Your display name, if provided by your authentication provider",
      "A unique account identifier",
      "Authentication metadata needed to manage your login session (such as OAuth provider tokens)",
    ],
  },
  {
    title: "3. Entitlement and access data",
    paragraphs: [
      "We store information about your access state so the product can deliver the correct features. This includes:",
    ],
    bullets: [
      "Your current plan (Free, Trial, or Premium)",
      "Trial start date, end date, and duration if a trial has been activated",
      "Premium activation and payment status",
      "Whether you have completed onboarding tours or first-time setup flows",
      "Feature-access flags used to determine what you can see and use",
    ],
  },
  {
    title: "4. App and device activity data",
    paragraphs: [
      "To support product functionality, security, and account management, we may record:",
    ],
    bullets: [
      "The time of your last login",
      "The last time the desktop app was active on your device",
      "Whether the app has been installed and used",
      "Account or admin activity events relevant to security, support, and fraud prevention",
      "We do not record keystrokes, personal files, clipboard contents, or full browsing history.",
    ],
  },
  {
    title: "5. System and telemetry data",
    paragraphs: [
      "When using the desktop app, SwitchControl may access hardware and system information to power its optimization, analysis, and advisory features. This includes:",
    ],
    bullets: [
      "Hardware profile information (CPU, GPU, RAM, storage) used by optimization and advisor features",
      "Real-time system metrics (CPU load, memory usage, GPU load) displayed in the dashboard",
      "Diagnostic data used by AI Advisor and BIOS Advisor to generate recommendations",
      "Network configuration data used by network optimization features",
      "This data is used locally to power the app's features. We collect only what is needed to provide functionality, analysis, and support, and nothing more.",
    ],
  },
  {
    title: "6. Administrative access",
    paragraphs: [
      "Authorized SwitchControl administrators may access account-level data for legitimate operational purposes, including:",
    ],
    bullets: [
      "Granting or revoking trial or premium access",
      "Updating subscription or plan status",
      "Resetting product flags such as onboarding completion",
      "Processing account deletion requests",
      "Investigating reports of abuse, fraud, or policy violations",
      "Providing account support",
      "Administrative actions are logged for accountability and security purposes.",
    ],
  },
  {
    title: "7. How we use your data",
    paragraphs: ["We use the data we hold to:"],
    bullets: [
      "Create and manage your account",
      "Deliver the features your plan entitles you to",
      "Power optimization, advisory, and diagnostic features in the app",
      "Process and verify payments",
      "Prevent fraud, abuse, and unauthorized access",
      "Provide customer and technical support",
      "Comply with legal obligations",
    ],
  },
  {
    title: "8. Sharing and service providers",
    paragraphs: [
      "We may share data with trusted third parties who help operate the service:",
    ],
    bullets: [
      "Payment processors, to complete and verify purchases",
      "Authentication providers, such as Google, to handle sign-in",
      "Hosting and infrastructure providers, to run and deliver the service",
      "We do not sell your personal information. We do not share data for advertising purposes.",
    ],
  },
  {
    title: "9. Cookies and session storage",
    paragraphs: [
      "We use cookies and session tokens to keep you signed in and maintain your access state across visits. These are limited to what is needed for the service to function.",
    ],
  },
  {
    title: "10. Data retention",
    paragraphs: [
      "We retain your data for as long as is reasonably necessary for the following purposes:",
    ],
    bullets: [
      "Delivering and supporting the product",
      "Maintaining billing and payment records",
      "Fraud prevention and security",
      "Fulfilling legal or regulatory obligations",
      "Resolving disputes or handling support cases",
      "Maintaining audit records where operationally required",
      "If you request deletion of your account, we will remove your data subject to any legal or security hold requirements.",
    ],
  },
  {
    title: "11. Security",
    paragraphs: [
      "We use reasonable technical and organizational safeguards to protect account data. No system is completely immune to risk. If you believe your account has been compromised, contact us immediately.",
    ],
  },
  {
    title: "12. Your rights and account deletion",
    paragraphs: ["Depending on your location, you may have rights to:"],
    bullets: [
      "Request a copy of the data we hold about you",
      "Request corrections to inaccurate data",
      "Request deletion of your account and associated data",
      "Object to or restrict certain uses of your data",
      "To make any of these requests, email us at switchcontrol67@gmail.com. We will respond promptly. Note that some data may be retained after deletion where legally or operationally required (for example, billing records or security logs).",
    ],
  },
  {
    title: "13. Age requirements",
    paragraphs: [
      "SwitchControl is not intended for use by anyone who cannot legally enter into a binding agreement in their jurisdiction, or who is below the minimum required age without appropriate parental or guardian permission. If you believe a minor has provided personal data without permission, contact us so we can remove it.",
    ],
  },
  {
    title: "14. Contact",
    paragraphs: [
      "For privacy questions, data requests, or concerns, contact us at switchcontrol67@gmail.com",
    ],
  },
];