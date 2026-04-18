import { Carousel } from "@ark-ui/react/carousel";
import { StarIcon, QuoteIcon } from "lucide-react";

export default function TestimonialsCarousel() {
  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "CEO, TechCorp",
      content:
        "This product has completely transformed how we work. The results have been incredible.",
      rating: 5,
      avatar:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
    },
    {
      name: "Michael Chen",
      role: "Designer, Creative Studio",
      content:
        "Outstanding quality and attention to detail. Highly recommend to anyone looking for excellence.",
      rating: 5,
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    },
    {
      name: "Emily Rodriguez",
      role: "Marketing Director",
      content:
        "The team was professional and delivered exactly what we needed. Exceeded our expectations.",
      rating: 5,
      avatar:
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80",
    },
  ];

  return (
    <Carousel.Root
      defaultPage={0}
      slideCount={testimonials.length}
      className="mx-auto max-w-2xl"
    >
      <Carousel.ItemGroup className="min-h-64">
        {testimonials.map((testimonial, index) => (
          <Carousel.Item
            key={index}
            index={index}
            className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow dark:border-gray-700 dark:bg-gray-800"
          >
            <QuoteIcon className="mx-auto mb-4 h-8 w-8 text-blue-500" />
            <p className="mb-6 text-lg italic text-gray-700 dark:text-gray-300">
              "{testimonial.content}"
            </p>
            <div className="mb-4 flex items-center justify-center gap-1">
              {Array.from({ length: testimonial.rating }).map((_, i) => (
                <StarIcon
                  key={i}
                  className="h-4 w-4 fill-yellow-400 text-yellow-400"
                />
              ))}
            </div>
            <div className="flex items-center justify-center gap-3">
              <img
                src={testimonial.avatar}
                alt={testimonial.name}
                className="h-12 w-12 rounded-full object-cover"
              />
              <div className="text-left">
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  {testimonial.name}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {testimonial.role}
                </p>
              </div>
            </div>
          </Carousel.Item>
        ))}
      </Carousel.ItemGroup>

      <div className="mt-6 flex items-center justify-between">
        <Carousel.PrevTrigger className="rounded-full bg-gray-100 p-3 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
          ←
        </Carousel.PrevTrigger>

        <Carousel.IndicatorGroup className="flex gap-2">
          {testimonials.map((_, index) => (
            <Carousel.Indicator
              key={index}
              index={index}
              className="h-3 w-3 cursor-pointer rounded-full bg-gray-300 transition-colors data-current:bg-blue-500 dark:bg-gray-600 dark:data-current:bg-blue-400"
            />
          ))}
        </Carousel.IndicatorGroup>

        <Carousel.NextTrigger className="rounded-full bg-gray-100 p-3 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
          →
        </Carousel.NextTrigger>
      </div>
    </Carousel.Root>
  );
}
