import {
  Calendar,
  MessageCircle,
  Mail,
  FileText,
  ClipboardList,
  AlertTriangle,
  BarChart3,
  Circle,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  calendar: Calendar,
  "message-circle": MessageCircle,
  mail: Mail,
  "file-text": FileText,
  "clipboard-list": ClipboardList,
  "alert-triangle": AlertTriangle,
  "bar-chart-3": BarChart3,
};

interface AttentionIconProps {
  name: string;
  size?: number;
  className?: string;
}

export function AttentionIcon({ name, size = 16, className }: AttentionIconProps) {
  const Icon = ICON_MAP[name] ?? Circle;
  return <Icon size={size} className={className} />;
}
