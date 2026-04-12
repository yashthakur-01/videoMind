import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Github, Chrome, LoaderCircle, X } from "lucide-react";
import { supabase } from "../lib/supabase";

export function AuthModal({ open, onClose }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const getSafeRedirectUrl = () => {
    const configured = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
    if (configured) {
      return configured;
    }

    const origin = window.location.origin;
    if ((origin.startsWith("http://") || origin.startsWith("https://")) && !origin.includes("localhost:3000")) {
      return `${origin}/`;
    }

    return "http://127.0.0.1:5173/";
  };

  const withLoading = async (action) => {
    setLoading(true);
    setMessage("");
    try {
      await action();
      setMessage(mode === "signup" ? "Check your inbox to confirm signup." : "Welcome back.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (event) => {
    event.preventDefault();
    await withLoading(async () => {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        } else {
            const { error } = await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: getSafeRedirectUrl() },
            });
          if (error) throw error;
        }

    });
  };

  const handleOAuth = async (provider) => {
    await withLoading(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: getSafeRedirectUrl() },
        });
      if (error) throw error;
    });
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="glass w-full max-w-md rounded-2xl p-6"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-white">{mode === "signin" ? "Welcome back" : "Create account"}</h3>
                <p className="text-sm text-slate-300">Access your AI chaptering workspace</p>
              </div>
              <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-white" aria-label="Close auth modal">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              />
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              />
              <button
                disabled={loading}
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-70"
              >
                {loading ? <LoaderCircle className="animate-spin" size={16} /> : null}
                {mode === "signin" ? "Sign in" : "Sign up"}
              </button>
            </form>

            <div className="my-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => handleOAuth("google")}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm hover:border-cyan-400"
              >
                <Chrome size={16} /> Google
              </button>
              <button
                onClick={() => handleOAuth("github")}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm hover:border-cyan-400"
              >
                <Github size={16} /> GitHub
              </button>
            </div>

            {message ? <p className="text-sm text-slate-300">{message}</p> : null}

            <button
              className="mt-4 text-sm text-cyan-300"
              onClick={() => setMode((current) => (current === "signin" ? "signup" : "signin"))}
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
