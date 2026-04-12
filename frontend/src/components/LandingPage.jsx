import { motion } from "framer-motion";
import { MessageSquareText, NotebookPen, Sparkles, ChevronRight } from "lucide-react";

const featureCards = [
  {
    title: "Macro-Chaptering",
    description: "Turn long-form videos into coherent, timestamped eras that retain narrative continuity.",
    icon: NotebookPen,
  },
  {
    title: "Seamless RAG Chat",
    description: "Ask natural language questions and get grounded answers with timestamped evidence.",
    icon: MessageSquareText,
  },
  {
    title: "Multi-Model Support",
    description: "Switch providers and models instantly to optimize output quality, speed, or budget.",
    icon: Sparkles,
  },
];

export function LandingPage({ onTryNow }) {
  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-10 sm:px-8 sm:py-14">
      <section className="glass overflow-hidden rounded-3xl p-8 sm:p-12">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 text-sm uppercase tracking-[0.2em] text-cyan-300">
            Information Overload -&gt; Structured Knowledge
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="max-w-3xl text-4xl font-semibold text-white sm:text-6xl"
        >
          VideoMind transforms dense videos into navigable chapters and interactive retrieval.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="mt-6 max-w-2xl text-base text-slate-300"
        >
          Stop scrubbing timelines and fragmented notes. Understand key moments instantly with AI chaptering and persistent chat grounded in sources.
        </motion.p>
        <button
          onClick={onTryNow}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300"
        >
          Try Now <ChevronRight size={16} />
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="glass rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white">The Problem</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li>- Time-consuming long-form video review.</li>
            <li>- Fragmented notes disconnected from original context.</li>
            <li>- Hard to retrieve precise insights with citations.</li>
          </ul>
        </article>
        <article className="glass rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white">The Solution</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li>- AI-driven macro-chaptering for semantic eras.</li>
            <li>- Interactive retrieval chat with timestamped sources.</li>
            <li>- Switch models and providers per use case.</li>
          </ul>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {featureCards.map((feature) => {
          const Icon = feature.icon;
          return (
            <motion.article
              key={feature.title}
              whileHover={{ y: -4 }}
              className="glass rounded-2xl p-6"
            >
              <Icon className="text-cyan-300" size={22} />
              <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-3 text-sm text-slate-300">{feature.description}</p>
            </motion.article>
          );
        })}
      </section>
    </div>
  );
}
