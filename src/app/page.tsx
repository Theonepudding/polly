import Link from 'next/link'
import { Suspense } from 'react'
import { Vote, Zap, Shield, BarChart3, Clock, Users, ExternalLink, ChevronRight } from 'lucide-react'
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
    icon: BarChart3,
    title: 'Live Results',
    desc: 'Results update in real-time on both Discord and the web dashboard as votes come in.',
    color: 'text-p-accent',
    bg:    'bg-p-accent-b',
  },
  {
    icon: Clock,
    title: 'Scheduled Polls',
    desc: 'Set up recurring polls that fire automatically on any interval you choose.',
    color: 'text-p-primary',
    bg:    'bg-p-primary-b',
  },
  {
    icon: Users,
    title: 'Multi-Server',
    desc: 'One bot, many servers. Each Discord gets its own dashboard, polls, and settings.',
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
    icon: Zap,
    title: 'Dashboard Embed',
    desc: 'Pin a live dashboard in any channel. Create polls and view results without leaving Discord.',
    color: 'text-p-accent',
    bg:    'bg-p-accent-b',
  },
]

const HOW_IT_WORKS = [
  { n: '01', title: 'Invite Polly',   desc: 'Add the bot to your Discord server in one click.' },
  { n: '02', title: 'Sign in',        desc: 'Log in with Discord to see your server\'s dashboard.' },
  { n: '03', title: 'Create a poll',  desc: 'Fill in the title, options, and optional close time.' },
  { n: '04', title: 'Members vote',   desc: 'Your server votes via Discord buttons or the web page.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Suspense>
        <AuthErrorBanner />
      </Suspense>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-4 pt-20 pb-24 text-center">
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
          Create beautiful polls, schedule them, and let your community vote — all without leaving Discord.
          Manage everything from a clean web dashboard.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer"
            className="btn-primary text-base px-6 py-3 gap-2.5">
            <ExternalLink size={16} />
            Add Polly to Discord
          </a>
          <Link href="/dashboard" className="btn-secondary text-base px-6 py-3">
            Open Dashboard
            <ChevronRight size={16} />
          </Link>
        </div>
      </section>

      {/* Demo poll card */}
      <section className="max-w-xl mx-auto px-4 pb-24">
        <div className="card p-6 shadow-xl shadow-black/40">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-p-text text-lg">What time works for raid night?</h3>
              <p className="text-p-muted text-sm mt-0.5">Closes in 2 days · 12 votes</p>
            </div>
            <span className="badge badge-success">Active</span>
          </div>
          {[
            { label: 'Friday 8pm UTC',    pct: 67, n: 8,  winner: true  },
            { label: 'Saturday 8pm UTC',  pct: 25, n: 3,  winner: false },
            { label: 'Sunday 6pm UTC',    pct: 8,  n: 1,  winner: false },
          ].map(opt => (
            <div key={opt.label} className="mb-4 last:mb-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-sm font-medium ${opt.winner ? 'text-p-accent' : 'text-p-text'}`}>
                  {opt.winner && '🏆 '}{opt.label}
                </span>
                <span className="text-p-muted text-xs">{opt.n} · {opt.pct}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className={opt.winner ? 'progress-fill-winner' : 'progress-fill'}
                  style={{ width: `${opt.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div className="text-center mb-12">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-p-text mb-3">Everything you need</h2>
          <p className="text-p-muted text-lg">Packed with features, designed to stay out of your way.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="card-hover p-6">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-4`}>
                <Icon size={20} className={color} />
              </div>
              <h3 className="font-display font-semibold text-p-text mb-2">{title}</h3>
              <p className="text-p-muted text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div className="text-center mb-12">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-p-text mb-3">How it works</h2>
          <p className="text-p-muted text-lg">Up and running in under two minutes.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {HOW_IT_WORKS.map(({ n, title, desc }) => (
            <div key={n} className="card p-6">
              <div className="font-display font-bold text-3xl text-p-primary/30 mb-3">{n}</div>
              <h3 className="font-display font-semibold text-p-text mb-1.5">{title}</h3>
              <p className="text-p-muted text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 pb-24">
        <div className="card-primary p-10 text-center rounded-2xl">
          <h2 className="font-display font-bold text-3xl text-p-text mb-3">Ready to start polling?</h2>
          <p className="text-p-muted mb-8">Add Polly to your server and run your first poll in minutes.</p>
          <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer"
            className="btn-primary text-base px-8 py-3 inline-flex mx-auto">
            <ExternalLink size={16} />
            Add to Discord — it&apos;s free
          </a>
        </div>
      </section>
    </div>
  )
}
