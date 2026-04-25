import { motion } from "framer-motion";
import { ChevronRight, LogIn } from "lucide-react";
import { HandWrittenTitle } from "@/components/ui/hand-writing-text";
import { Button as RainbowButton } from "@/components/ui/rainbow-borders-button";
import SkewCards from "@/components/ui/gradient-card-showcase";
import { Feature197 } from "@/components/ui/accordion-feature-section";
import { Footer } from "@/components/ui/modem-animated-footer";
import { StarsBackground } from "@/components/ui/stars";
import processImage1 from "../../resource/image1.png";
import processImage2 from "../../resource/image2.png";
import processImage3 from "../../resource/image3.png";

const processFeatures = [
  {
    id: 1,
    title: "Upload",
    image: processImage1,
    description:
      "Drop your video file or paste a link. VideoMind supports long-form lectures, meetings, and tutorials with zero manual setup.",
  },
  {
    id: 2,
    title: "Analyze",
    image: processImage2,
    description:
      "Our Video Mind engine processes both audio and visual context to generate transcript quality, logical chapters, and key moments.",
  },
  {
    id: 3,
    title: "Review",
    image: processImage3,
    description:
      "Access interactive transcripts, exact timestamps, and AI-generated insights so you can find decisions, quotes, and action items instantly.",
  },
];

export function LandingPage({ onTryNow }) {
  return (
    <div className="relative min-h-screen bg-black">
      {/* Advisory Notice */}
      <div className="w-full z-50 bg-yellow-400 text-black text-center font-semibold py-3 px-2 shadow-md sticky top-0">
        <span>
          <strong>Notice:</strong> Transcript fetching is{" "}
          <u>not working currently</u>. Some features may be unavailable.
        </span>
      </div>
      <div className="pointer-events-none sticky top-0 h-screen w-full">
        <StarsBackground
          className="h-full w-full"
          speed={90}
          factor={0.02}
          starColor="#d9f7ff"
        />
        <motion.div
          initial={{ opacity: 0.38 }}
          animate={{ opacity: [0.3, 0.46, 0.3] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-x-0 bottom-0 h-[48vh] bg-gradient-to-t from-cyan-200/28 via-cyan-100/14 to-transparent"
        />
      </div>

      <div className="relative z-10 -mt-[100vh] min-h-screen w-full">
        <div className="mx-auto flex w-full justify-end px-4 pt-6 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
            className="cursor-pointer select-none"
            whileTap={{ scale: 0.98 }}
            onClick={onTryNow}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onTryNow();
              }
            }}
          >
            <div className="inline-flex items-center gap-2 text-md font-medium text-gray-100/90 transition hover:text-cyan-50">
              <LogIn size={15} />
              <span> Login | Sign in</span>
            </div>
          </motion.div>
        </div>

        <section
          id="features"
          className="mx-auto flex min-h-[100vh] w-full flex-col items-center justify-center px-4 text-center sm:px-8"
        >
          <HandWrittenTitle title="VideoMIND" subtitle="" />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.7, ease: "easeOut" }}
            className="-mt-2 mb-5 max-w-4xl"
          >
            <p className="text-2xl font-semibold text-white md:text-4xl">
              Your Videos, Organized by AI.
            </p>
            <p className="mx-auto mt-4 max-w-3xl text-sm text-slate-300/85 md:text-lg">
              Stop scrubbing through hours of footage. VideoMind automatically
              transcribes, segments, and summarizes your content so you can find
              exactly what you need in seconds.
            </p>
          </motion.div>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.15, duration: 0.6, ease: "easeOut" }}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <RainbowButton
                onClick={onTryNow}
                className="h-14 min-w-[220px] rounded-2xl bg-black/60 px-8 text-base font-semibold text-cyan-50"
              >
                Get Started for Free <ChevronRight size={16} />
              </RainbowButton>
            </motion.div>
            <motion.a
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.6, ease: "easeOut" }}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.98 }}
              href="#how-it-works"
              className="inline-flex h-14 min-w-[170px] items-center justify-center rounded-2xl border border-slate-600/80 bg-black/30 px-6 text-base font-semibold text-slate-100 transition hover:border-cyan-300/80 hover:text-cyan-100"
            >
              Watch Demo
            </motion.a>
          </div>
        </section>

        <div
          id="how-it-works"
          className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-8"
        >
          <div className="mb-1 text-center">
            <h2 className="text-3xl font-semibold text-white md:text-4xl">
              How It Works
            </h2>
            <p className="mt-2 text-base text-slate-300/85">
              Intelligent segmentation, deep summarization, and global search
              working together.
            </p>
          </div>
          <SkewCards />
        </div>

        <Feature197 features={processFeatures} />

        <Footer
          className="bg-transparent"
          brandName="VideoMind"
          brandDescription="Transform raw video into searchable chapters, concise summaries, and context-grounded answers."
          navLinks={[
            { label: "Features", href: "#features" },
            { label: "How It Works", href: "#how-it-works" },
            { label: "Process", href: "#process" },
            { label: "Support", href: "mailto:yashthakurr001@gmail.com" },
          ]}
          creatorName="VideoMind"
          creatorUrl="https://github.com/yashthakur-01/"
        />
      </div>
    </div>
  );
}
