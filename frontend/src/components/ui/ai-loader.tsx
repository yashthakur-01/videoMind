import * as React from "react";

interface LoaderProps {
  text?: string;
}

export const Component: React.FC<LoaderProps> = ({ text = "Generating" }) => {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/70">
      <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-5">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300/90 animate-pulse [animation-delay:0ms]" />
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300/90 animate-pulse [animation-delay:200ms]" />
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300/90 animate-pulse [animation-delay:400ms]" />
        </div>
        <p className="text-sm text-zinc-300">{text}...</p>
      </div>
    </div>
  );
};
