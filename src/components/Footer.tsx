import Link from 'next/link'
import { Vote } from 'lucide-react'

const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? ''}&permissions=274878024704&scope=bot%20applications.commands`

export default function Footer() {
  return (
    <footer className="border-t border-p-border mt-20 py-10 text-p-muted text-sm">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-p-primary-b border border-p-primary/40 flex items-center justify-center">
              <Vote size={13} className="text-p-primary" />
            </div>
            <span className="font-display font-semibold text-p-text">Polly</span>
          </div>
          <nav className="flex gap-5 text-xs">
            <Link href="/"          className="hover:text-p-text transition-colors">Home</Link>
            <Link href="/dashboard" className="hover:text-p-text transition-colors">Dashboard</Link>
            <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer"
              className="hover:text-p-text transition-colors">Add to Discord</a>
          </nav>
          <p className="text-xs text-p-subtle">Polly — open-source Discord poll bot</p>
        </div>
      </div>
    </footer>
  )
}
