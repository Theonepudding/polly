export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-5 flex items-center gap-4">
            <div className="skeleton w-12 h-12 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton w-4 h-4 rounded shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
