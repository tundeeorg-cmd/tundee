export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#0A0A0A]">
      <div className="max-w-[800px] mx-auto px-6 py-10">
        {/* Header skeleton */}
        <div className="h-9 w-40 bg-[#E5E5EA] rounded-lg animate-pulse mb-8" />

        {/* Avatar + name section */}
        <div className="bg-white dark:bg-[#161B27] rounded-[16px] p-8 mb-6 flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#E5E5EA] animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 bg-[#E5E5EA] rounded animate-pulse" />
            <div className="h-4 w-36 bg-[#F7F9FC] rounded animate-pulse" />
          </div>
        </div>

        {/* Form section skeletons */}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-[#161B27] rounded-[16px] p-8 mb-6 space-y-4">
            <div className="h-6 w-32 bg-[#E5E5EA] rounded animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <div className="h-4 w-24 bg-[#E5E5EA] rounded animate-pulse" />
                  <div className="h-11 bg-[#F7F9FC] rounded-lg animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="h-11 w-full bg-[#2E6BE6]/20 rounded-full animate-pulse" />
      </div>
    </div>
  );
}
