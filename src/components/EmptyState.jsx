// ════════════════════════════════════════════════════════════════════
// EmptyState — welcome screen
// ════════════════════════════════════════════════════════════════════
export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-logo">π</div>
      <div className="empty-title">Welcome to πui</div>
      <div className="empty-sub">
        A clean interface for the pi agent. Upload images and files, ask questions, build things.
      </div>
    </div>
  )
}
