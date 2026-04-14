import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { OnboardingForm } from "@/components/ui/onboarding-form";
import { StarsBackground } from "@/components/ui/stars";
import { ToastHost, useAppToast } from "@/components/ui/toast-1";
import { useSession } from "@/lib/session-context";
import { supabase } from "@/lib/supabase";

export function AuthPage() {
  const { user } = useSession();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <ToastHost>
      <AuthPageContent />
    </ToastHost>
  );
}

function AuthPageContent() {
  const [mode, setMode] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState("");
  const showToast = useAppToast();

  const getSafeRedirectUrl = () => {
    const configured = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
    if (configured) return configured;
    return `${window.location.origin}/`;
  };

  const onSubmit = async ({ username, email, password, confirmPassword }) => {
    setLoading(true);
    setMessage("");
    try {
      if (mode === "signup") {
        if (!username?.trim()) {
          throw new Error("Username is required.");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getSafeRedirectUrl(),
            data: { username },
          },
        });
        if (error) throw error;
        setMessage("Account created. Check your inbox to verify your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const onGoogleLogin = async () => {
    setGoogleLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getSafeRedirectUrl(),
        },
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error.message || "Google login failed.");
      setGoogleLoading(false);
    }
  };

  return (
    <ToastHost>
      <div className="relative h-screen w-full overflow-hidden bg-black">
        <div className="pointer-events-none fixed inset-0">
          <StarsBackground className="h-full w-full" speed={95} factor={0.015} starColor="#ffffff" />
        </div>

        <div className="relative z-10 mx-auto flex w-full px-4 pt-6 sm:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-black/55 px-3 py-2 text-sm text-slate-200 transition hover:border-white/40 hover:text-white"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
        </div>

        <div className="relative z-10 flex h-[calc(100vh-100px)] items-center justify-center px-4 pb-4">
          <OnboardingForm
            className="sticky top-6"
            mode={mode}
            title={mode === "signin" ? "Welcome back" : "Create your VideoMIND account"}
            description={
              mode === "signin"
                ? "Sign in to continue your AI-powered video workflow."
                : "Choose a username and secure password to get started quickly."
            }
            buttonText={mode === "signin" ? "Sign in" : "Create account"}
            onSubmit={onSubmit}
            isSubmitting={loading}
            onGoogleLogin={onGoogleLogin}
            isGoogleLoading={googleLoading}
            onValidationError={showToast}
            onToggleMode={() => setMode((current) => (current === "signin" ? "signup" : "signin"))}
            message={message}
          />
        </div>
      </div>
    </ToastHost>
  );
}