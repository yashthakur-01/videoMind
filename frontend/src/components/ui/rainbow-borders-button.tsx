import React from "react";
import { cn } from "@/lib/utils";

type RainbowBorderButtonProps = {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
};

export const Button = ({
  children = "Button",
  className,
  onClick,
  type = "button",
}: RainbowBorderButtonProps) => {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "rainbow-border relative inline-flex h-11 min-w-[152px] items-center justify-center gap-2.5 rounded-xl border-none bg-black/70 px-5 text-sm font-black text-cyan-50 transition-all duration-200 backdrop-blur-sm",
        className
      )}
    >
      {children}
    </button>
  );
};