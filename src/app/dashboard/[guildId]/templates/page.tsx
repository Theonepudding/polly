import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getTemplates } from '@/lib/poll-templates'
import { getGuild } from '@/lib/guilds'
import Link from 'next/link'
import { Clock, Bookmark } from 'lucide-react'
import CreateScheduledPollModal from '@/components/CreateScheduledPollModal'
import TemplateActions from '@/components/TemplateActions'
import LocalTime from '@/components/LocalTime'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ guildId: string }> }

export default async function TemplatesPage({ params }: Props) {
  const { guildId } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')

  const [guild, templates] = await Promise.all([
    getGuild(guildId),
    getTemplates(guildId),
  ])

  const userId   = session.user?.id ?? ''
  const userName = session.user?.name ?? ''

  const quickTemplates    = templates.filter(t => t.isScheduled === false)
  const scheduledPolls    = templates.filter(t => t.isScheduled !== false)

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-p-muted text-sm mb-1">
            <Link href="/dashboard" className="hover:text-p-text transition-colors">Dashboard</Link>
            <span>/</span>
            <Link href={`/dashboard/${guildId}`} className="hover:text-p-text transition-colors">{guild?.guildName}</Link>
            <span>/</span>
            <span className="text-p-text">Templates &amp; Schedules</span>
          </div>
          <h1 className="font-display font-bold text-3xl text-p-text">Templates &amp; Schedules</h1>
        </div>
        <CreateScheduledPollModal guildId={guildId} userId={userId} userName={userName} />
      </div>

      {/* Quick Templates */}
      {quickTemplates.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Bookmark size={15} className="text-p-primary" />
            <h2 className="font-display font-semibold text-lg text-p-text">Saved Templates</h2>
            <span className="badge badge-muted text-xs">{quickTemplates.length}</span>
          </div>
          <p className="text-sm text-p-muted mb-4">Poll structures saved for quick reuse. Load them from the &quot;Create poll&quot; form.</p>
          <div className="flex flex-col gap-3">
            {quickTemplates.map(t => (
              <div key={t.id} className="card p-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-p-text mb-1">{t.title}</h3>
                  <div className="flex gap-3 text-xs text-p-muted flex-wrap">
                    <span>{t.options.length} option{t.options.length !== 1 ? 's' : ''}</span>
                    {t.isAnonymous && <span>Anonymous</span>}
                    {t.allowMultiple && <span>Multi-choice</span>}
                    {t.includeTimeSlots && <span>{t.timeSlots.length} availability slot{t.timeSlots.length !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <TemplateActions guildId={guildId} userId={userId} userName={userName} template={t} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Scheduled Polls */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-p-primary" />
          <h2 className="font-display font-semibold text-lg text-p-text">Scheduled Polls</h2>
          {scheduledPolls.length > 0 && <span className="badge badge-muted text-xs">{scheduledPolls.length}</span>}
        </div>

        {scheduledPolls.length === 0 ? (
          <div className="card p-10 text-center text-p-muted">
            <Clock size={32} className="mx-auto mb-3 text-p-subtle" />
            <p className="mb-4">No scheduled polls yet.</p>
            <p className="text-sm">Scheduled polls fire automatically at your chosen interval — great for recurring check-ins or weekly events.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {scheduledPolls.map(t => (
              <div key={t.id} className="card p-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display font-semibold text-p-text">{t.title}</h3>
                    <span className={`badge ${t.active ? 'badge-success' : 'badge-muted'}`}>
                      {t.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-p-muted flex-wrap">
                    <span>Every {t.intervalDays} day{t.intervalDays !== 1 ? 's' : ''}</span>
                    <span>Open for {t.daysOpen} day{t.daysOpen !== 1 ? 's' : ''}</span>
                    <span>Next: <LocalTime iso={t.nextRunAt} dateStyle="medium" timeStyle="short" /></span>
                    {t.lastRunAt && <span>Last ran: <LocalTime iso={t.lastRunAt} dateStyle="medium" /></span>}
                  </div>
                </div>
                <TemplateActions guildId={guildId} userId={userId} userName={userName} template={t} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
