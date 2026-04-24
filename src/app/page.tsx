import Link from 'next/link'
import { Suspense } from 'react'
import { Vote, Zap, Shield, BarChart3, Clock, Users, ExternalLink, ChevronRight, CheckCircle2, Link2, ScrollText } from 'lucide-react'
import AuthErrorBanner from '@/components/AuthErrorBanner'

const BOT_INVITE_URL = process.env.DISCORD_CLIENT_ID
  ? `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=274878024704&scope=bot%20applications.commands`
  : '#'

const FEATURES = [
  {
    icon: Vote,
    title: 'In-Discord Voting',
    desc: 'Polls live right in your server. Members vote with a single button click — no links, no friction.',
    color: 'text-p-primary',
    bg:    'bg-p-primary-b',
  },
  {
    icon: Link2,
    title: 'No-Login Quick Create',
    desc: 'Use /poll in Discord, pick a type, and get a one-click link. Create your poll on the web — no account needed.',
    color: 'text-p-accent',
    bg:    'bg-p-accent-b',
  },
  {
    icon: BarChart3,
    title: 'Live Results',
    desc: 'Results update in real-time on both Discord and the web dashboard as votes come in.',
    color: 'text-p-primary',
    bg:    'bg-p-primary-b',
  },
  {
    icon: Clock,
    title: 'Schedule Polls',
    desc: 'Let voters pick their option and a preferred time. Polly collects both in one step — perfect for raids, meetings, and events.',
    color: 'text-p-accent',
    bg:    'bg-p-accent-b',
  },
  {
    icon: Shield,
    title: 'Role-Based Access',
    desc: 'Control who can create polls and who can vote — per server, using Discord roles.',
    color: 'text-p-primary',
    bg:    'bg-p-primary-b',
  },
  {
    icon: ScrollText,
    title: 'Audit Log',
    desc: 'Full history of every poll created, closed, and voted on. Searchable from the dashboard.',
    color: 'text-p-accent',
    bg:    'bg-p-accent-b',
  },
  {
    icon: Users,
    title: 'Multi-Server',
    desc: 'One bot, many servers. Each Discord gets its own dashboard, polls, and settings.',
    color: 'text-p-primary',
    bg:    'bg-p-primary-b',
  },
  {
    icon: Zap,
    title: 'Dashboard Embed',
    desc: 'Pin a live dashboard in any channel. Create polls and view results without leaving Discord.',
    color: 'text-p-accent',
    bg:    'bg-p-accent-b',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Suspense>
        <AuthErrorBanner />
      </Suspense>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-4 pt-24 pb-20 text-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-p-primary/8 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[150px] rounded-full bg-p-accent/6 blur-2xl" />
        </div>
        <div className="relative">
          <div className="inline-flex items-center gap-2 badge badge-primary mb-6 text-sm px-3 py-1.5">
            <Zap size={13} />
            Discord Poll Bot
          </div>
          <h1 className="font-display font-bold text-5xl sm:text-6xl md:text-7xl leading-tight mb-6">
            <span className="heading-display">Polls that live</span>
            <br />
            <span className="text-p-text">inside Discord</span>
          </h1>
          <p className="text-p-muted text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Create polls in seconds — straight from Discord, no account required. Voting, scheduling, and live results all in one bot.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer"
              className="btn-primary text-base px-7 py-3 gap-2.5 shadow-lg shadow-indigo-500/25">
              <ExternalLink size={16} />
              Add Polly to Discord
            </a>
            <Link href="/dashboard" className="btn-secondary text-base px-7 py-3">
              Open Dashboard
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Quick-create callout */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="card p-6 sm:p-8 border border-p-primary/20 bg-p-primary/5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-p-primary-b flex items-center justify-center shrink-0">
              <Link2 size={22} className="text-p-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-display font-bold text-xl text-p-text mb-1">Create polls from Discord — no login needed</h2>
              <p className="text-p-muted text-sm leading-relaxed">
                Type <code className="text-p-primary bg-p-primary/10 px-1.5 py-0.5 rounded text-xs">/poll</code> in your server, pick a poll type, and get a personal one-click link. It opens a full poll editor on the website — already tied to your server and account — so you can set options, duration, and settings without ever logging in.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap shrink-0">
              <span className="badge badge-primary text-xs px-2.5 py-1">No account</span>
              <span className="badge badge-muted text-xs px-2.5 py-1">10 min link</span>
              <span className="badge badge-muted text-xs px-2.5 py-1">Single use</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-10">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-p-text mb-3">Everything you need</h2>
          <p className="text-p-muted text-lg">Packed with features, designed to stay out of your way.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="card-hover p-6 group">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110`}>
                <Icon size={20} className={color} />
              </div>
              <h3 className="font-display font-semibold text-p-text mb-2">{title}</h3>
              <p className="text-p-muted text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Schedule voting showcase */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 badge badge-primary mb-5 text-sm px-3 py-1.5">
              <Clock size={13} />
              Schedule Polls
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-p-text mb-4">
              Stop the back-and-forth.<br />Find a time that works.
            </h2>
            <p className="text-p-muted text-lg mb-6 leading-relaxed">
              Attach time preferences to any poll. Voters choose their option <em>and</em> their preferred time — Polly collects both in one step.
            </p>
            <ul className="space-y-3">
              {[
                'Set any time options you like — full timezone support on the web form',
                'Works with any poll — events, raids, meetings, anything',
                'Time results shown separately so you can find the overlap',
              ].map(item => (
                <li key={item} className="flex items-start gap-2.5 text-p-muted text-sm">
                  <CheckCircle2 size={15} className="text-p-success shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Mock Discord UI */}
          <div className="card p-5 space-y-4 shadow-xl shadow-black/30">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-p-primary-b flex items-center justify-center shrink-0">
                <Vote size={14} className="text-p-primary" />
              </div>
              <div>
                <p className="text-p-text font-semibold text-sm">Which day for the FC raid?</p>
                <p className="text-p-muted text-xs">6 votes · closes in 2 days</p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Friday',   pct: 50, n: 3, active: true  },
                { label: 'Saturday', pct: 33, n: 2, active: false },
                { label: 'Sunday',   pct: 17, n: 1, active: false },
              ].map(opt => (
                <div key={opt.label}>
                  <div className="flex justify-between mb-1">
                    <span className={`text-xs font-medium ${opt.active ? 'text-p-primary' : 'text-p-text'}`}>{opt.label}</span>
                    <span className="text-p-muted text-xs">{opt.n} · {opt.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-p-surface-2 overflow-hidden">
                    <div className={`h-full rounded-full ${opt.active ? 'bg-p-primary' : 'bg-p-muted/40'}`} style={{ width: `${opt.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-p-border pt-3">
              <p className="text-p-muted text-xs mb-2.5">You voted <strong className="text-p-text">Friday</strong> — pick a preferred time:</p>
              <div className="flex flex-wrap gap-2">
                {['7pm', '8pm', '9pm', '10pm', 'No preference'].map((t, i) => (
                  <span key={t} className={`badge px-3 py-1.5 text-xs ${i === 1 ? 'badge-primary' : 'badge-muted'}`}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
