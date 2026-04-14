import { useMemo, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FeatureItem {
  id: number;
  title: string;
  image: string;
  description: string;
}

interface Feature197Props {
  features: FeatureItem[];
}

const defaultFeatures: FeatureItem[] = [
  {
    id: 1,
    title: "Upload",
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
    description:
      "Drop your video file or paste a public link. VideoMind accepts long-form talks, meetings, tutorials, and lectures with no manual prep.",
  },
  {
    id: 2,
    title: "Analyze",
    image:
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80",
    description:
      "Our Video Mind engine processes audio and visual context to generate an accurate transcript, semantic chapters, and key moments.",
  },
  {
    id: 3,
    title: "Review",
    image:
      "https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80",
    description:
      "Open an interactive workspace with timestamps, chapter summaries, and searchable answers so you can jump straight to what matters.",
  },
];

const Feature197 = ({ features = defaultFeatures }: Feature197Props) => {
  const initial = useMemo(() => features[0], [features]);
  const [activeTabId, setActiveTabId] = useState<number | null>(initial?.id ?? null);
  const [activeImage, setActiveImage] = useState(initial?.image ?? "");

  return (
    <section id="process" className="py-16 md:py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
        <div className="mb-10 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Process</p>
          <h3 className="mt-2 text-3xl font-semibold text-white md:text-4xl">From Raw Video To Insight In 3 Steps</h3>
          <p className="mx-auto mt-3 max-w-3xl text-sm text-slate-300/85 md:text-base">
            A simple 1-2-3 flow designed for speed, intelligence, and clarity.
          </p>
        </div>

        <div className="mb-12 flex w-full flex-col items-start justify-between gap-10 md:mb-0 md:flex-row md:items-center md:gap-12">
          <div className="w-full md:w-1/2">
            <Accordion type="single" className="w-full" defaultValue="item-1">
              {features.map((tab) => (
                <AccordionItem key={tab.id} value={`item-${tab.id}`}>
                  <AccordionTrigger
                    onClick={() => {
                      setActiveImage(tab.image);
                      setActiveTabId(tab.id);
                    }}
                    className="cursor-pointer py-5 !no-underline transition"
                  >
                    <h6
                      className={`text-xl font-semibold ${tab.id === activeTabId ? "text-white" : "text-slate-400"}`}
                    >
                      {tab.id}. {tab.title}
                    </h6>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="mt-3 text-base text-slate-300/90">{tab.description}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="relative m-auto hidden w-[42%] max-w-[420px] overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/40 md:block">
            <img
              src={activeImage}
              alt="Feature preview"
              className="h-[260px] w-full rounded-md object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export { Feature197 };
