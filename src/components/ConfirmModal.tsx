'use client'
import { X } from 'lucide-react'

interface Props {
  title:     string
  message:   string
  confirm:   string
  danger?:   boolean
  onConfirm: () => void
  onCancel:  () => void
}

export default function ConfirmModal({ title, message, confirm, danger, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm card shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-p-border">
          <h2 className="font-display font-bold text-lg text-p-text">{title}</h2>
          <button onClick={onCancel} className="text-p-muted hover:text-p-text p-1 rounded transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-p-muted text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onCancel} className="btn-ghost flex-1 justify-center">Cancel</button>
          <button
            onClick={onConfirm}
            className={`flex-1 justify-center ${danger ? 'btn-danger' : 'btn-primary'}`}
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
