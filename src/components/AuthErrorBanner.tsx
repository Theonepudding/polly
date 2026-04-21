'use client'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

export default function AuthErrorBanner() {
  const params = useSearchParams()
  if (!params.get('auth_error')) return null

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4">
      <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          Discord login failed. Make sure you are a member of the FC Discord server and try again.
          If the problem persists, contact an admin.
        </span>
      </div>
    </div>
  )
}
