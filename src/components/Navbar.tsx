'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X, LogIn, LogOut, LayoutDashboard, Settings } from 'lucide-react'

const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&permissions=274878024704&scope=bot%20applications.commands`

export default function Navbar() {
  const { data: session } = useSession()
  const [open, setOpen]   = useState(false)
  const pathname          = usePathname()
  const isBotAdmin        = session?.user?.isBotAdmin

  function navCls(href: string) {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
    return `px-3 py-1.5 rounded-lg text-sm transition-all ${
      active
        ? 'text-p-text bg-p-surface-2 font-medium'
        : 'text-p-muted hover:text-p-text hover:bg-p-surface-2'
    }`
  }

  return (
    <nav className="sticky top-0 z-50 bg-p-bg/90 backdrop-blur-md border-b border-p-border/60">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <Image src="/avatar.png" alt="Polly" width={32} height={32} className="rounded-xl" />
          <span className="font-display font-bold text-lg text-p-text">Polly</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <Link href="/" className={navCls('/')}>Home</Link>
          {session && (
            <Link href="/dashboard" className={`flex items-center gap-1.5 ${navCls('/dashboard')}`}>
              <LayoutDashboard size={14} />
              Dashboard
            </Link>
          )}
          {isBotAdmin && (
            <Link href="/admin" className={`flex items-center gap-1.5 ${navCls('/admin')}`}>
              <Settings size={14} />
              Admin
            </Link>
          )}
        </div>

        {/* Auth */}
        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="flex items-center gap-2 group px-2 py-1 rounded-lg hover:bg-p-surface-2 transition-all">
                {session.user?.image && (
                  <Image src={session.user.image} alt="" width={28} height={28}
                    className="rounded-full border border-p-border group-hover:border-p-primary/50 transition-colors" />
                )}
                <span className="text-sm text-p-text max-w-[120px] truncate">{session.user?.name}</span>
              </Link>
              <button onClick={() => signOut({ callbackUrl: '/' })} className="btn-ghost text-xs py-1.5">
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-2">
                Add to Discord
              </a>
              <button onClick={() => signIn('discord', { callbackUrl: '/dashboard' })} className="btn-discord">
                <LogIn size={14} />
                Sign in
              </button>
            </div>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2 text-p-muted hover:text-p-text" onClick={() => setOpen(o => !o)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-p-border bg-p-surface/95 backdrop-blur-md px-4 py-3 flex flex-col gap-1 animate-slide-down">
          <Link href="/" onClick={() => setOpen(false)}
            className={`py-2.5 ${navCls('/')}`}>
            Home
          </Link>
          {session && (
            <Link href="/dashboard" onClick={() => setOpen(false)}
              className={`flex items-center gap-2 py-2.5 ${navCls('/dashboard')}`}>
              <LayoutDashboard size={15} />
              Dashboard
            </Link>
          )}
          {isBotAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)}
              className={`flex items-center gap-2 py-2.5 ${navCls('/admin')}`}>
              <Settings size={15} />
              Admin
            </Link>
          )}
          <div className="mt-2 pt-2 border-t border-p-border">
            {session ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {session.user?.image && (
                    <Image src={session.user.image} alt="" width={26} height={26} className="rounded-full" />
                  )}
                  <span className="text-sm text-p-text">{session.user?.name}</span>
                </div>
                <button onClick={() => signOut({ callbackUrl: '/' })} className="btn-ghost text-xs py-1">
                  <LogOut size={12} /> Sign out
                </button>
              </div>
            ) : (
              <button onClick={() => signIn('discord', { callbackUrl: '/dashboard' })} className="btn-discord w-full justify-center">
                <LogIn size={14} /> Sign in with Discord
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
