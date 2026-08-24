import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { BrandLogo } from "@/components/BrandLogo";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { brand } from "@/config/brand";
import { useAuth } from "@/components/ProtectedRoute";
import { motion, useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  Download,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { GlowButton } from "./GlowButton";
import { WebsiteBackground } from "./WebsiteBackground";
import type { ComponentProps } from "react";

type BgVariant = ComponentProps<typeof WebsiteBackground>["variant"];

interface WebsiteShellProps {
  children: ReactNode;
  variant?: "full" | "inner" | "minimal";
  bgVariant?: BgVariant;
  showFooter?: boolean;
  className?: string;
}

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
];

function FullHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { prefersReducedMotion } = useMotion();
  const { user, isLoading, logout } = useAuth();
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const el = headerRef.current;
      if (!el) return;
      const scrolled = window.scrollY > 20;
      el.style.boxShadow = scrolled
        ? "0 8px 32px rgba(0,0,0,0.28), 0 1px 0 0 rgba(255,255,255,0.10), inset 0 -1px 0 0 rgba(255,255,255,0.06)"
        : "0 4px 24px rgba(0,0,0,0.18), 0 1px 0 0 rgba(255,255,255,0.07)";
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  return (
    <motion.header
      ref={headerRef}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        "bg-[rgba(255,255,255,0.07)] backdrop-blur-md border-b border-white/[0.18]"
      )}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <BrandLogo size="lg" linkTo="/" />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => {
              const linkClass = "relative text-sm font-semibold text-white/80 hover:text-white transition-colors duration-300 tracking-wide py-1 group";
              const inner = (
                <>
                  {link.label}
                  <span className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                </>
              );
              return link.href.startsWith("/") ? (
                <Link key={link.label} href={link.href} className={linkClass}>{inner}</Link>
              ) : (
                <a key={link.label} href={link.href} className={linkClass}>{inner}</a>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {isLoading ? (
              <div className="w-20 h-9 bg-white/5 rounded-lg animate-pulse" />
            ) : user ? (
              <>
                {(user as any).isAdmin && (
                  <Link href="/admin">
                    <button
                      className="text-sm font-semibold text-orange-400 hover:text-orange-300 transition-colors px-3 py-2 border border-orange-500/30 rounded-lg hover:border-orange-400/50 hover:bg-orange-500/10"
                      data-testid="link-admin-panel"
                    >
                      Admin
                    </button>
                  </Link>
                )}
                <GlowButton
                  variant="primary"
                  data-testid="button-header-download"
                  onClick={() => { window.location.href = "/download"; }}
                >
                  <Download className="size-4" />
                  Download
                </GlowButton>
                <button
                  className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-2"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="size-4" />
                </button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <button className="text-sm text-white/40 hover:text-white/70 transition-colors px-4 py-2 tracking-wide">
                    Log in
                  </button>
                </Link>
                <Link href="/login">
                  <GlowButton variant="cyan" data-testid="button-header-get-started">
                    Get Started
                  </GlowButton>
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 text-white/70 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <motion.div
          className="md:hidden border-t border-white/[0.06]"
          style={{
            background: "linear-gradient(180deg, hsl(260 25% 6% / 0.95) 0%, hsl(260 22% 7% / 0.9) 100%)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="px-4 py-4 space-y-3">
            {NAV_LINKS.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.label}
                  href={link.href}
                  className="block text-sm text-white/80 hover:text-white transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="block text-sm text-white/80 hover:text-white transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              )
            )}
            <div className="pt-3 border-t border-white/[0.06] space-y-2">
              {user ? (
                <>
                  {(user as any).isAdmin && (
                    <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                      <button className="w-full text-sm font-semibold text-orange-400 hover:text-orange-300 py-2 border border-orange-500/30 rounded-lg hover:bg-orange-500/10">
                        Admin Panel
                      </button>
                    </Link>
                  )}
                  <GlowButton
                    variant="cyan"
                    className="w-full"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      window.location.href = "/download";
                    }}
                  >
                    <Download className="size-4" />
                    Download
                  </GlowButton>
                  <button
                    className="w-full text-sm text-white/40 hover:text-white/70 py-2 flex items-center justify-center gap-2"
                    onClick={handleLogout}
                  >
                    <LogOut className="size-4" />
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <button className="w-full text-sm text-white/60 py-2">Log in</button>
                  </Link>
                  <Link href="/login">
                    <GlowButton variant="cyan" className="w-full">
                      Get Started
                    </GlowButton>
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}

function InnerHeader() {
  return (
    <header
      className="relative z-10 bg-[rgba(255,255,255,0.07)] backdrop-blur-md border-b border-white/[0.18]"
      style={{
        boxShadow: "0 4px 24px rgba(0,0,0,0.18), 0 1px 0 0 rgba(255,255,255,0.07)",
      }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <BrandLogo size="sm" linkTo="/" />
        </div>
      </div>
    </header>
  );
}

function WebsiteFooter() {
  return (
    <footer className="relative z-10 border-t border-white/[0.05]">
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <BrandLogo size="md" className="mb-4" linkTo="/" />
            <p className="text-sm text-white/30 leading-relaxed">
              Windows PC optimization focused on lower delay and stable FPS.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-white/60 mb-4 text-xs tracking-[0.15em] uppercase">Product</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/features" className="text-white/30 hover:text-white/60 transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-white/30 hover:text-white/60 transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-white/30 hover:text-white/60 transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-white/60 mb-4 text-xs tracking-[0.15em] uppercase">Legal</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/terms" className="text-white/30 hover:text-white/60 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-white/30 hover:text-white/60 transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-white/60 mb-4 text-xs tracking-[0.15em] uppercase">Support</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="mailto:switchcontrol67@gmail.com"
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  Contact
                </a>
              </li>
              <li>
                <a
                  href={SOCIAL_LINKS.discord}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  Discord
                </a>
              </li>
              <li>
                <a
                  href={SOCIAL_LINKS.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  YouTube
                </a>
              </li>
              <li>
                <a
                  href={SOCIAL_LINKS.tiktokSwitchTech}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  TikTok · SwitchTech
                </a>
              </li>
              <li>
                <a
                  href={SOCIAL_LINKS.tiktokSwitchControl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  TikTok · SwitchControl
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-white/[0.04]">
          <p className="text-center text-xs text-white/15 tracking-widest uppercase">
            &copy; {new Date().getFullYear()} {brand.name}
          </p>
        </div>
      </div>
    </footer>
  );
}

export function WebsiteShell({ children, variant = "full", bgVariant, showFooter = true, className }: WebsiteShellProps) {
  const resolvedBgVariant = bgVariant || (variant === "full" ? "landing" : "landing");

  return (
    <div className="min-h-screen relative bg-[#040508]">
      {/* WebsiteBackground is position:fixed, no animation needed */}
      <WebsiteBackground variant={resolvedBgVariant} />

      {variant === "full" && <FullHeader />}
      {variant === "inner" && <InnerHeader />}

      {/* Opacity + y only, no blur rasterization cost on every route */}
      <motion.div
        className={cn("relative z-10", variant === "full" && "pt-16", className)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>

      {showFooter && <WebsiteFooter />}
    </div>
  );
}
