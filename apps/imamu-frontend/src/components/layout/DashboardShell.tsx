interface DashboardShellProps {
  children: React.ReactNode
}

export default function DashboardShell({ children }: DashboardShellProps) {
  return <div className="min-h-screen bg-[#0A2F35]">{children}</div>
}
