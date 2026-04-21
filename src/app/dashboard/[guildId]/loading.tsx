export default function GuildDashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-8 w-56" />
        </div>
        <div className="flex items-center gap-3">
          <div className="skeleton h-9 w-32 rounded-lg" />
          <div className="skeleton h-9 w-24 rounded-lg" />
          <div className="skeleton h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card p-4">
            <div className="skeleton h-3 w-20 mb-3" />
            <div className="skeleton h-7 w-10" />
          </div>
        ))}
      </div>

      {/* Active polls */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton h-6 w-32" />
          <div className="skeleton h-4 w-16" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="card p-5 flex flex-col gap-3">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
              <div className="flex flex-col gap-2 mt-1">
                <div className="skeleton h-2 w-full rounded-full" />
                <div className="skeleton h-2 w-4/5 rounded-full" />
                <div className="skeleton h-2 w-2/3 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently closed */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton h-6 w-40" />
          <div className="skeleton h-4 w-16" />
        </div>
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="card p-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <div className="skeleton h-4 w-48" />
                <div className="skeleton h-3 w-32" />
              </div>
              <div className="skeleton h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
