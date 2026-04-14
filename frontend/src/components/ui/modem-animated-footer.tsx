import React from "react";
import { cn } from "@/lib/utils";

interface FooterLink {
  label: string;
  href: string;
}

interface SocialLink {
  icon: React.ReactNode;
  href: string;
  label: string;
}

interface FooterProps {
  brandName?: string;
  brandDescription?: string;
  socialLinks?: SocialLink[];
  navLinks?: FooterLink[];
  creatorName?: string;
  creatorUrl?: string;
  className?: string;
}

export const Footer = ({
  brandName = "YourBrand",
  brandDescription = "Your description here",
  socialLinks = [],
  navLinks = [],
  creatorName,
  creatorUrl,
  className,
}: FooterProps) => {
  return (
    <section className={cn("relative mt-0 w-full overflow-hidden", className)}>
      <footer className="relative mt-8 border-t border-border/60 bg-transparent">
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col p-4 py-6">
          <div className="mb-2 flex w-full flex-col sm:mb-3 md:mb-3">
            <div className="flex w-full flex-col items-center">
              <div className="flex flex-1 flex-col items-center space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-foreground">{brandName}</span>
                </div>
                <p className="w-full max-w-sm px-4 text-center text-sm font-medium text-muted-foreground sm:w-96 sm:px-0">
                  {brandDescription}
                </p>
              </div>

              {socialLinks.length > 0 && (
                <div className="mb-5 mt-3 flex gap-4">
                  {socialLinks.map((link, index) => (
                    <a
                      key={index}
                      href={link.href}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="h-6 w-6 duration-300 hover:scale-110">{link.icon}</div>
                      <span className="sr-only">{link.label}</span>
                    </a>
                  ))}
                </div>
              )}

              {navLinks.length > 0 && (
                <div className="flex max-w-full flex-wrap justify-center gap-3 px-4 text-sm font-medium text-muted-foreground">
                  {navLinks.map((link, index) => (
                    <a
                      key={index}
                      className="duration-300 hover:font-semibold hover:text-foreground"
                      href={link.href}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-1 flex flex-col items-center justify-center gap-1 px-4 md:mt-2 md:flex-row md:items-center md:justify-between md:px-0">
            <p className="text-center text-sm text-muted-foreground md:text-left">
              ©{new Date().getFullYear()} {brandName}. All rights reserved.
            </p>
            {creatorName && creatorUrl && (
              <nav className="flex gap-4">
                <a
                  href={creatorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground transition-colors duration-300 hover:font-medium hover:text-foreground"
                >
                  Crafted by {creatorName}
                </a>
              </nav>
            )}
          </div>
        </div>

        <div
          className="pointer-events-none absolute bottom-4 left-1/2 z-0 -translate-x-1/2 select-none bg-gradient-to-b from-foreground/30 via-foreground/14 to-transparent bg-clip-text px-2 text-center font-extrabold uppercase leading-none tracking-[-0.05em] text-transparent md:bottom-2"
          style={{
            fontSize: "clamp(4.2rem, 18vw, 14rem)",
            maxWidth: "95vw",
          }}
        >
          {brandName.toUpperCase()}
        </div>

        <div className="absolute bottom-10 left-1/2 h-[1px] w-full -translate-x-1/2 bg-gradient-to-r from-transparent via-border to-transparent backdrop-blur-sm" />

        <div className="absolute bottom-8 h-12 w-full bg-gradient-to-t from-transparent via-black/10 to-transparent blur-[0.6em]" />
      </footer>
    </section>
  );
};
