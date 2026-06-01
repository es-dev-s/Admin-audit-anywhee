import Link from "next/link";

export default function NotFound() {
  return (
    <div className="fixed inset-0 z-0 flex h-[100dvh] min-h-0 w-screen flex-col overflow-hidden bg-white">
      <div className="flex min-h-0 flex-1 items-center justify-center p-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- entire image fits viewport (no crop) */}
        <img
          src="/404-page.png"
          alt="Page not found"
          className="block max-h-none max-w-none object-contain object-center"
          style={{
            maxWidth: "100vw",
            maxHeight: "100dvh",
            width: "auto",
            height: "auto",
          }}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
        <Link
          href="/"
          className="pointer-events-auto rounded-full border border-white/40 bg-black/35 px-6 py-2.5 text-[13px] font-semibold text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/50"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
