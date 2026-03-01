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

interface WebsiteShellProps {
  children: ReactNode;
  variant?: "full" | "inner" | "minimal";
  showFooter?: boolean;
  className?: string;
}

function WebsiteBackground() {
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.3 });
  const rafRef = useRef<number | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (rafRef.current !== null || isMobile) return;
    rafRef.current = requestAnimationFrame(() => {
      setMousePos({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
      rafRef.current = null;
    });
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove, isMobile]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 120% 60% at 50% -10%, hsl(270 55% 40% / 0.25) 0%, transparent 55%),
            radial-gradient(ellipse 80% 50% at 10% 20%, hsl(260 60% 50% / 0.12) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 90% 70%, hsl(280 50% 45% / 0.10) 0%, transparent 50%),
            radial-gradient(ellipse 50% 30% at 70% 10%, hsl(190 80% 50% / 0.06) 0%, transparent 50%),
            linear-gradient(180deg, hsl(260 22% 7%) 0%, hsl(260 18% 5%) 40%, hsl(260 20% 4%) 100%)
          `,
        }}
      />

      <div
        className="absolute rounded-full blur-[140px] w-[600px] h-[600px] opacity-[0.18] website-blob-1"
        style={{
          top: "5%",
          left: "5%",
          background: "radial-gradient(circle, hsl(270 55% 50%) 0%, hsl(280 60% 40%) 50%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full blur-[120px] w-[500px] h-[500px] opacity-[0.12] website-blob-2"
        style={{
          top: "45%",
          right: "0%",
          background: "radial-gradient(circle, hsl(280 50% 45%) 0%, hsl(290 40% 35%) 50%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full blur-[100px] w-[400px] h-[400px] opacity-[0.08] website-blob-3"
        style={{
          bottom: "10%",
          left: "20%",
          background: "radial-gradient(circle, hsl(260 45% 40%) 0%, transparent 70%)",
        }}
      />

      {!isMobile && (
        <div
          className="absolute w-[700px] h-[700px] rounded-full transition-all duration-[1500ms] ease-out"
          style={{
            left: `${mousePos.x * 100}%`,
            top: `${mousePos.y * 100}%`,
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, hsl(270 60% 60% / 0.07) 0%, hsl(280 50% 50% / 0.03) 40%, transparent 70%)",
          }}
        />
      )}

      <div className="absolute inset-0 pointer-events-none ws-perspective-grid" />

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.022]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "#faq" },
];

function FullHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { prefersReducedMotion } = useMotion();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  return (
    <motion.header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b transition-all duration-500",
        scrolled
          ? "bg-[hsl(260,22%,7%,0.8)] backdrop-blur-2xl border-white/[0.06] shadow-[0_4px_30px_rgba(0,0,0,0.4)]"
          : "bg-transparent border-transparent"
      )}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <BrandLogo size="lg" linkTo="/" />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-white/45 hover:text-white transition-colors duration-200 tracking-wide"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {isLoading ? (
              <div className="w-20 h-9 bg-white/5 rounded-lg animate-pulse" />
            ) : user ? (
              <>
                <Link href="/download">
                  <GlowButton variant="primary" data-testid="button-header-download">
                    <Download className="size-4" />
                    Download
                  </GlowButton>
                </Link>
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
                  <button className="text-sm text-white/45 hover:text-white transition-colors px-4 py-2 tracking-wide">
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
          className="md:hidden bg-[hsl(260,22%,7%,0.95)] backdrop-blur-2xl border-t border-white/[0.06]"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="px-4 py-4 space-y-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="block text-sm text-white/60 hover:text-white transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 border-t border-white/[0.06] space-y-2">
              {user ? (
                <>
                  <Link href="/download">
                    <GlowButton variant="cyan" className="w-full">
                      <Download className="size-4" />
                      Download
                    </GlowButton>
                  </Link>
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
    <header className="relative z-10 p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
        <BrandLogo size="sm" linkTo="/" />
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
                <a href="#features" className="text-white/30 hover:text-white/60 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <Link href="/pricing" className="text-white/30 hover:text-white/60 transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <a href="#faq" className="text-white/30 hover:text-white/60 transition-colors">
                  FAQ
                </a>
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

export function WebsiteShell({ children, variant = "full", showFooter = true, className }: WebsiteShellProps) {
  return (
    <div className="min-h-screen relative bg-[hsl(260,22%,7%)]">
      <WebsiteBackground />

      {variant === "full" && <FullHeader />}
      {variant === "inner" && <InnerHeader />}

      <div className={cn("relative z-10", variant === "full" && "pt-16", className)}>
        {children}
      </div>

      {showFooter && <WebsiteFooter />}
    </div>
  );
}
