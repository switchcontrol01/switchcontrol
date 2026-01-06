import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { brand } from "@/config/brand";
import AnimateIn from "@/components/AnimateIn";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function Login() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const rawNext = params.get('next') || '/download';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/download';
  const authUrl = `/auth/google?next=${encodeURIComponent(next)}`;
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black flex flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      <header className="relative z-10 p-4">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <AnimateIn>
          <Card className="w-full max-w-md bg-black/50 border-white/10 backdrop-blur-xl">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <img 
                  src={brand.icon} 
                  alt={`${brand.name} logo`}
                  className="w-16 h-16 rounded-xl shadow-lg shadow-primary/30"
                />
              </div>
              <CardTitle className="text-2xl text-white">Welcome to {brand.name}</CardTitle>
              <CardDescription>Sign in to access your optimization dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-center text-muted-foreground mb-4">
                Sign in securely with your Google account
              </p>
              
              <a href={authUrl} className="block">
                <Button 
                  className="w-full bg-white hover:bg-gray-100 text-gray-900 h-14 text-base font-medium"
                  data-testid="button-login-google"
                >
                  <GoogleIcon className="size-5 mr-3" />
                  Continue with Google
                </Button>
              </a>
              
              <p className="text-xs text-center text-muted-foreground mt-6">
                Your data is protected and never shared.
              </p>
              
              <p className="text-xs text-muted-foreground text-center mt-2">
                By continuing, you agree to our{" "}
                <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              </p>
            </CardContent>
          </Card>
        </AnimateIn>
      </main>
    </div>
  );
}
