import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, LogIn } from "lucide-react";
import { brand } from "@/config/brand";

export default function Login() {
  const handleLogin = () => {
    try {
      window.location.href = '/api/login';
    } catch (error) {
      console.error('Login redirect failed:', error);
      alert('Unable to redirect to login. Please try again.');
    }
  };

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
        <Card className="w-full max-w-md bg-black/50 border-white/10 backdrop-blur-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img 
                src={brand.icon} 
                alt={`${brand.name} logo`}
                className="w-14 h-14 rounded-xl shadow-lg shadow-primary/30"
              />
            </div>
            <CardTitle className="text-2xl text-white">Welcome to {brand.name}</CardTitle>
            <CardDescription>Sign in to access your optimization dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-center text-muted-foreground mb-4">
              Sign in securely with your preferred provider
            </p>
            
            <Button 
              className="w-full bg-primary hover:bg-primary/90 h-14 text-base font-medium"
              onClick={handleLogin}
              data-testid="button-login"
            >
              <LogIn className="size-5 mr-2" />
              Continue to Sign In
            </Button>
            
            <p className="text-xs text-center text-muted-foreground mt-4">
              You can sign in with Google, Discord, GitHub, Apple, or email.
              <br />
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
      </main>
    </div>
  );
}
