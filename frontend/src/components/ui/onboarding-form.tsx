import * as React from "react";
import { motion } from "framer-motion";
import { Loader2, AtSign, Mail, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FADE_UP_ANIMATION_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring" } },
};

const OnboardingForm = React.forwardRef(
  (
    {
      className,
      mode = "signin",
      title,
      description,
      buttonText,
      onSubmit,
      isSubmitting = false,
      onToggleMode,
      onGoogleLogin,
      isGoogleLoading = false,
      onValidationError,
      message,
      ...props
    },
    ref
  ) => {
    const [formValues, setFormValues] = React.useState({
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    });

    const isSignup = mode === "signup";

    const handleChange = (key) => (e) => {
      setFormValues((current) => ({ ...current, [key]: e.target.value }));
    };

    const handleSubmit = (e) => {
      e.preventDefault();

      const emailValue = formValues.email.trim();
      const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);

      if (isSignup && !formValues.username.trim()) {
        onValidationError?.("Missing username", "Please enter a username to continue.");
        return;
      }

      if (!emailValue) {
        onValidationError?.("Missing email", "Please enter your email address.");
        return;
      }

      if (!isEmailValid) {
        onValidationError?.("Invalid email", "Please enter a valid email address.");
        return;
      }

      if (!formValues.password.trim()) {
        onValidationError?.("Missing password", "Please enter your password.");
        return;
      }

      if (isSignup && !formValues.confirmPassword.trim()) {
        onValidationError?.("Missing confirmation", "Please confirm your password.");
        return;
      }

      if (isSignup && formValues.password !== formValues.confirmPassword) {
        onValidationError?.("Password mismatch", "Password and confirmation do not match.");
        return;
      }

      onSubmit(formValues);
    };

    return (
      <motion.div
        initial="hidden"
        animate="show"
        viewport={{ once: true }}
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: 0.12,
            },
          },
        }}
        className={cn(
          "w-full max-w-md overflow-hidden rounded-2xl border border-white/25 bg-black/85 shadow-[0_0_80px_rgba(255,255,255,0.14)] backdrop-blur-xl",
          className
        )}
        ref={ref}
        {...props}
      >
        <motion.div variants={FADE_UP_ANIMATION_VARIANTS}>
          <img
            src="https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?auto=format&fit=crop&w=1400&q=80"
            alt="Cosmic banner"
            className="h-40 w-full object-cover"
          />
        </motion.div>

        <div className="space-y-6 p-8 text-center">
          <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="space-y-2">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="text-slate-300/90">{description}</p>
          </motion.div>

          <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full border-white/40 bg-black text-white hover:bg-white hover:text-black"
              onClick={onGoogleLogin}
              disabled={isGoogleLoading || isSubmitting}
            >
              {isGoogleLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.6-4.8 9.6-7.3 0-.5-.1-.8-.1-1.1H12Z" />
                </svg>
              )}
              Continue with Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/20" />
              </div>
                <span className="relative bg-black/90 px-2 text-xs uppercase tracking-wider text-slate-400">
                  or continue with email
                </span>
            </div>
          </motion.div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {isSignup ? (
              <motion.div variants={FADE_UP_ANIMATION_VARIANTS}>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="username"
                    placeholder="username"
                    className="border-white/20 bg-black/70 pl-9 text-slate-100 placeholder:text-slate-500 focus-visible:ring-white"
                    value={formValues.username}
                    onChange={handleChange("username")}
                  />
                </div>
              </motion.div>
            ) : null}

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS}>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email"
                  className="border-white/20 bg-black/70 pl-9 text-slate-100 placeholder:text-slate-500 focus-visible:ring-white"
                  value={formValues.email}
                  onChange={handleChange("email")}
                />
              </div>
            </motion.div>

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS}>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="password"
                  className="border-white/20 bg-black/70 pl-9 text-slate-100 placeholder:text-slate-500 focus-visible:ring-white"
                  value={formValues.password}
                  onChange={handleChange("password")}
                />
              </div>
            </motion.div>

            {isSignup ? (
              <motion.div variants={FADE_UP_ANIMATION_VARIANTS}>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="confirm password"
                    className="border-white/20 bg-black/70 pl-9 text-slate-100 placeholder:text-slate-500 focus-visible:ring-white"
                    value={formValues.confirmPassword}
                    onChange={handleChange("confirmPassword")}
                  />
                </div>
              </motion.div>
            ) : null}

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS}>
              <Button type="submit" className="w-full border border-white/40 bg-black text-white hover:bg-white hover:text-black" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {buttonText}
              </Button>
            </motion.div>
          </form>

          {message ? <p className="text-sm text-slate-300">{message}</p> : null}

          <motion.div variants={FADE_UP_ANIMATION_VARIANTS}>
            <button
              type="button"
              onClick={onToggleMode}
              className="text-sm text-slate-300 hover:text-white"
            >
              {isSignup ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
          </motion.div>
        </div>
      </motion.div>
    );
  }
);

OnboardingForm.displayName = "OnboardingForm";

export { OnboardingForm };