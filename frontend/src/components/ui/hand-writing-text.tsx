"use client";

import { motion } from "framer-motion";

interface HandWrittenTitleProps {
  title?: string;
  subtitle?: string;
}

function HandWrittenTitle({
  title = "Hand Written",
  subtitle = "",
}: HandWrittenTitleProps) {
  const draw = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { duration: 3, ease: [0.43, 0.13, 0.23, 0.96] },
        opacity: { duration: 0.7 },
      },
    },
  };

  return (
    <div className="relative mx-auto w-full max-w-6xl py-10 pt-0">
      <div className="relative mx-auto h-[250px] w-full md:h-[290px]">
        <div className="absolute inset-0">
          <motion.svg
            width="100%"
            height="100%"
            viewBox="0 0 1200 600"
            initial="hidden"
            animate="visible"
            className="h-full w-full"
          >
            <title>KokonutUI</title>
            <motion.path
              d="M 950 90
                 C 1250 300, 1050 480, 600 520
                 C 250 520, 150 480, 150 300
                 C 150 120, 350 80, 600 80
                 C 850 80, 950 180, 950 180"
              fill="none"
              strokeWidth="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              variants={draw}
              className="text-cyan-100 opacity-95"
            />
          </motion.svg>
        </div>
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 text-center">
          <motion.h1
            className="flex items-center gap-2 text-7xl font-semibold tracking-[0.01em] text-white md:text-9xl lg:text-[11rem]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            {title}
          </motion.h1>
        </div>
      </div>
      {subtitle && (
        <motion.p
          className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-300/80 md:text-base"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.8, ease: "easeOut" }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}

export { HandWrittenTitle };