export default function ScholarshipDetailLoading() {
  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0A0A0A]">
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        {/* Back link skeleton */}
        <div className="h-4 w-24 bg-[#E5E5EA] rounded animate-pulse mb-8" />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
          {/* Main content skeleton */}
          <div className="space-y-6">
            {/* Header card */}
            <div className="bg-white dark:bg-[#1C1C1E] rounded-[16px] p-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-16 bg-[#E5E5EA] rounded animate-pulse" />
                  <div className="h-8 w-3/4 bg-[#E5E5EA] rounded-lg animate-pulse" />
                  <div className="h-5 w-1/2 bg-[#E5E5EA] rounded animate-pulse" />
                </div>
                <div className="h-10 w-10 bg-[#F5F5F7] rounded-full animate-pulse" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-[#F5F5F7] rounded-lg animate-pulse" />
                ))}
              </div>
            </div>

            {/* Details card */}
            <div className="bg-white dark:bg-[#1C1C1E] rounded-[16px] p-8 space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 w-24 bg-[#E5E5EA] rounded animate-pulse shrink-0" />
                  <div className="h-4 flex-1 bg-[#F5F5F7] rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar skeleton */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-[#1C1C1E] rounded-[16px] p-6 space-y-4">
              <div className="h-11 w-full bg-[#F0A500]/20 rounded-full animate-pulse" />
              <div className="h-11 w-full bg-[#F5F5F7] rounded-full animate-pulse" />
            </div>
            <div className="bg-white dark:bg-[#1C1C1E] rounded-[16px] p-6 space-y-3">
              <div className="h-5 w-40 bg-[#E5E5EA] rounded animate-pulse" />
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-12 bg-[#F5F5F7] rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
