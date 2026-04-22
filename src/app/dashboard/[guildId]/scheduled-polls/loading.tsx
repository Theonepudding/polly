export default function ScheduledPollsLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton h-8 w-48" />
        </div>
        <div className="skeleton h-9 w-36 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-5 flex items-center gap-4">
            <div className="flex-1 flex flex-col gap-2">
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-3 w-32" />
            </div>
            <div className="skeleton h-7 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
