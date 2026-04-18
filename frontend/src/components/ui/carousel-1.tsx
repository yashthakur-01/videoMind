import { Carousel } from "@ark-ui/react/carousel";

export default function BasicCarousel() {
  const images = Array.from(
    { length: 5 },
    (_, i) => `https://picsum.photos/seed/${i + 1}/500/300`,
  );

  return (
    <Carousel.Root
      defaultPage={0}
      slideCount={images.length}
      className="mx-auto max-w-md"
    >
      <Carousel.Control className="mb-4 flex items-center justify-between">
        <Carousel.PrevTrigger className="rounded-lg bg-gray-100 px-4 py-2 font-medium transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
          Previous
        </Carousel.PrevTrigger>
        <Carousel.NextTrigger className="rounded-lg bg-gray-100 px-4 py-2 font-medium transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
          Next
        </Carousel.NextTrigger>
      </Carousel.Control>

      <Carousel.ItemGroup className="overflow-hidden rounded-lg">
        {images.map((image, index) => (
          <Carousel.Item key={index} index={index}>
            <img
              src={image}
              alt={`Slide ${index + 1}`}
              className="h-64 w-full object-cover"
            />
          </Carousel.Item>
        ))}
      </Carousel.ItemGroup>

      <Carousel.IndicatorGroup className="mt-4 flex items-center justify-center gap-2">
        {images.map((_, index) => (
          <Carousel.Indicator
            key={index}
            index={index}
            className="h-2 w-2 cursor-pointer rounded-full bg-gray-300 transition-colors data-current:bg-blue-500 dark:bg-gray-600"
          />
        ))}
      </Carousel.IndicatorGroup>
    </Carousel.Root>
  );
}
