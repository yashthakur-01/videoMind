import React from "react";

const cards = [
  {
    title: "Intelligent Segmentation",
    desc: "VideoMind detects topic transitions and semantic breaks to split videos into coherent, timestamped chapters automatically.",
    gradientClass: "bg-[linear-gradient(315deg,#7dd3fc,#0ea5e9)]",
  },
  {
    title: "Deep Summarization",
    desc: "Get concise chapter-level summaries with key takeaways so you can understand hour-long content in minutes.",
    gradientClass: "bg-[linear-gradient(315deg,#a78bfa,#ec4899)]",
  },
  {
    title: "Global Search",
    desc: "Search inside spoken content, not just titles. Jump to exact moments with context-backed responses and timestamps.",
    gradientClass: "bg-[linear-gradient(315deg,#34d399,#22d3ee)]",
  },
];

export default function SkewCards() {
  return (
    <>
      <div className="flex min-h-[600px] flex-wrap items-center justify-center py-3">
        {cards.map(({ title, desc, gradientClass }, idx) => (
          <div
            key={idx}
            className="group relative m-[24px_20px] flex h-[360px] w-[360px] items-center justify-center transition-all duration-500"
          >
            <span
              className={`absolute left-1/2 top-1/2 h-[90%] w-[64%] -translate-x-1/2 -translate-y-1/2 skew-x-[15deg] rounded-lg transition-all duration-500 group-hover:h-[96%] group-hover:w-[calc(100%-80px)] group-hover:skew-x-0 ${gradientClass}`}
            />
            <span
              className={`absolute left-1/2 top-1/2 h-[90%] w-[64%] -translate-x-1/2 -translate-y-1/2 skew-x-[15deg] rounded-lg blur-[30px] transition-all duration-500 group-hover:h-[96%] group-hover:w-[calc(100%-80px)] group-hover:skew-x-0 ${gradientClass}`}
            />

            <span className="pointer-events-none absolute inset-0 z-10">
              <span className="animate-blob absolute left-0 top-0 h-0 w-0 rounded-lg bg-[rgba(255,255,255,0.08)] opacity-0 shadow-[0_5px_15px_rgba(0,0,0,0.15)] backdrop-blur-[10px] transition-all duration-100 group-hover:left-[50px] group-hover:top-[-50px] group-hover:h-[100px] group-hover:w-[100px] group-hover:opacity-100" />
              <span className="animate-blob animation-delay-1000 absolute bottom-0 right-0 h-0 w-0 rounded-lg bg-[rgba(255,255,255,0.08)] opacity-0 shadow-[0_5px_15px_rgba(0,0,0,0.15)] backdrop-blur-[10px] transition-all duration-500 group-hover:bottom-[-50px] group-hover:right-[50px] group-hover:h-[100px] group-hover:w-[100px] group-hover:opacity-100" />
            </span>

            <div className="relative left-0 z-20 flex h-[300px] w-[92%] flex-col rounded-lg bg-[rgba(255,255,255,0.04)] p-[28px_34px] text-white shadow-lg backdrop-blur-[10px] transition-all duration-500 group-hover:left-[-20px] group-hover:h-[300px] group-hover:p-[44px_34px]">
              <h2 className="mb-4 text-[1.9rem] font-semibold leading-tight tracking-wide">{title}</h2>
              <p className="text-lg leading-relaxed text-slate-100/90">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translateY(10px); }
          50% { transform: translate(-10px); }
        }
        .animate-blob { animation: blob 2s ease-in-out infinite; }
        .animation-delay-1000 { animation-delay: -1s; }
      `}</style>
    </>
  );
}
