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
            radial-gradient(ellipse 80% 50% at 20% 15%, hsl(270 60% 55% / 0.12) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 60%, hsl(280 55% 50% / 0.08) 0%, transparent 50%),
            linear-gradient(180deg, hsl(260 20% 6%) 0%, hsl(260 18% 5%) 50%, hsl(260 20% 4%) 100%)
          `,
        }}
      />

      <div
        className="absolute rounded-full blur-[120px] w-[500px] h-[500px] opacity-[0.12] website-blob-1"
        style={{
          top: "10%",
          left: "10%",
          background: "radial-gradient(circle, hsl(270 60% 55%) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full blur-[100px] w-[400px] h-[400px] opacity-[0.08] website-blob-2"
        style={{
          top: "50%",
          right: "5%",
          background: "radial-gradient(circle, hsl(280 55% 50%) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full blur-[80px] w-[350px] h-[350px] opacity-[0.06] website-blob-3"
        style={{
          bottom: "15%",
          left: "25%",
          background: "radial-gradient(circle, hsl(260 50% 45%) 0%, transparent 70%)",
        }}
      />

      {!isMobile && (
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-[0.04] transition-transform duration-1000 ease-out"
          style={{
            left: `${mousePos.x * 100}%`,
            top: `${mousePos.y * 100}%`,
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, hsl(270 60% 65%) 0%, transparent 70%)",
          }}
        />
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.025 }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="ws-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ws-grid)" />
        </svg>
      </div>

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.018]"
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
          ? "bg-[hsl(260,20%,6%,0.85)] backdrop-blur-2xl border-white/[0.08] shadow-lg shadow-black/30"
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
                className="text-sm text-white/50 hover:text-white transition-colors duration-200"
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
                  <button className="text-sm text-white/50 hover:text-white transition-colors px-4 py-2">
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
          className="md:hidden bg-[hsl(260,20%,6%,0.95)] backdrop-blur-2xl border-t border-white/[0.06]"
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
    <footer className="relative z-10 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <BrandLogo size="md" className="mb-4" linkTo="/" />
            <p className="text-sm text-white/35 leading-relaxed">
              Windows PC optimization focused on lower delay and stable FPS.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-white/70 mb-4 text-sm tracking-wide">Product</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="#features" className="text-white/35 hover:text-white/70 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <Link href="/pricing" className="text-white/35 hover:text-white/70 transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <a href="#faq" className="text-white/35 hover:text-white/70 transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-white/70 mb-4 text-sm tracking-wide">Legal</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/terms" className="text-white/35 hover:text-white/70 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-white/35 hover:text-white/70 transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-white/70 mb-4 text-sm tracking-wide">Support</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="mailto:switchcontrol67@gmail.com"
                  className="text-white/35 hover:text-white/70 transition-colors"
                >
                  Contact
                </a>
              </li>
              <li>
                <a
                  href={SOCIAL_LINKS.discord}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/35 hover:text-white/70 transition-colors"
                >
                  Discord
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-white/[0.04]">
          <p className="text-center text-xs text-white/20 tracking-wider">
            &copy; {new Date().getFullYear()} {brand.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function WebsiteShell({ children, variant = "full", showFooter = true, className }: WebsiteShellProps) {
  return (
    <div className="min-h-screen relative bg-[hsl(260,20%,6%)]">
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
