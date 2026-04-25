import { Calendar, MessageCircle, Mail, FileText, Circle } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  calendar: Calendar,
  'message-circle': MessageCircle,
  mail: Mail,
  'file-text': FileText,
}

interface AttentionIconProps {
  name: string
  size?: number
  className?: string
}

export function AttentionIcon({ name, size = 16, className }: AttentionIconProps) {
  const Icon = ICON_MAP[name] ?? Circle
  return <Icon size={size} className={className} />
}
