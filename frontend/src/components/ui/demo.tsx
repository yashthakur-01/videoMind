import { Footer } from "@/components/ui/modem-animated-footer";
import { Twitter, Linkedin, Github, Mail } from "lucide-react";

export default function FooterDemo() {
  const socialLinks = [
    {
      icon: <Twitter className="h-6 w-6" />,
      href: "https://twitter.com",
      label: "Twitter",
    },
    {
      icon: <Linkedin className="h-6 w-6" />,
      href: "https://linkedin.com",
      label: "LinkedIn",
    },
    {
      icon: <Github className="h-6 w-6" />,
      href: "https://github.com",
      label: "GitHub",
    },
    {
      icon: <Mail className="h-6 w-6" />,
      href: "mailto:hello@videomind.app",
      label: "Email",
    },
  ];

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Sign In", href: "/auth" },
    { label: "Support", href: "mailto:hello@videomind.app" },
  ];

  return (
    <Footer
      brandName="VideoMind"
      brandDescription="Turn long videos into searchable chapters, summaries, and answers in minutes."
      socialLinks={socialLinks}
      navLinks={navLinks}
      creatorName="VideoMind Team"
      creatorUrl="https://github.com"
    />
  );
}
