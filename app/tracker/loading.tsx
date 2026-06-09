export default function TrackerLoading() {
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#0A0A0A]">
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        {/* Header skeleton */}
        <div className="h-9 w-48 bg-[#E5E5EA] rounded-lg animate-pulse mb-2" />
        <div className="h-5 w-72 bg-[#E5E5EA] rounded animate-pulse mb-10" />

        {/* Section skeletons */}
        {[...Array(3)].map((_, sectionIdx) => (
          <div key={sectionIdx} className="mb-10">
            <div className="h-6 w-36 bg-[#E5E5EA] rounded animate-pulse mb-4" />
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-[#161B27] rounded-[12px] p-5 flex items-center gap-4"
                >
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-3/4 bg-[#E5E5EA] rounded animate-pulse" />
                    <div className="h-4 w-1/2 bg-[#F7F9FC] rounded animate-pulse" />
                    <div className="h-2 w-full bg-[#F7F9FC] rounded-full animate-pulse mt-2" />
                  </div>
                  <div className="h-8 w-20 bg-[#F7F9FC] rounded-lg animate-pulse shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
