export default function ScholarshipsLoading() {
  return (
    <div className="bg-white min-h-screen">
      {/* Page header skeleton */}
      <div className="bg-[#F5F5F7] border-b border-[#E5E5EA]">
        <div className="max-w-[1200px] mx-auto px-6 py-12">
          <div className="h-9 w-64 bg-[#E5E5EA] rounded-lg animate-pulse mb-3" />
          <div className="h-5 w-80 bg-[#E5E5EA] rounded animate-pulse" />
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="flex gap-8">
          {/* Sidebar skeleton */}
          <aside className="hidden md:block w-72 shrink-0 space-y-4">
            <div className="h-6 w-24 bg-[#E5E5EA] rounded animate-pulse" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-[#F5F5F7] rounded-lg animate-pulse" />
            ))}
          </aside>

          <div className="flex-1 min-w-0">
            {/* Tier filter skeleton */}
            <div className="flex gap-2 mb-5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-8 w-24 bg-[#F5F5F7] rounded-full animate-pulse" />
              ))}
            </div>

            {/* Results count skeleton */}
            <div className="h-5 w-32 bg-[#E5E5EA] rounded animate-pulse mb-6" />

            {/* Card grid skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-52 bg-[#F5F5F7] rounded-[12px] animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
