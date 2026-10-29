import { GitBranch, ListChecks } from 'lucide-react'
import './AuthoringSectionTabs.css'

export type AuthoringSection = 'flow' | 'steps'

const sections = [
  { id: 'flow', label: 'フローチャート作成', Icon: GitBranch },
  { id: 'steps', label: '手順作成', Icon: ListChecks },
] as const

export default function AuthoringSectionTabs({ value, onChange, nodeCount, stepCount }: {
  value: AuthoringSection
  onChange: (section: AuthoringSection) => void
  nodeCount: number
  stepCount: number
}) {
  return <div className="authoring-section-tabs" role="tablist" aria-label="作成セクション">
    {sections.map(({ id, label, Icon }, index) => <button
      key={id}
      id={`authoring-${id}-tab`}
      type="button"
      role="tab"
      aria-label={label}
      aria-selected={value === id}
      aria-controls={`authoring-${id}-panel`}
      tabIndex={value === id ? 0 : -1}
      onClick={() => onChange(id)}
      onKeyDown={event => {
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1
          : event.key === 'ArrowRight' ? (index + 1) % sections.length
            : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : null
        if (nextIndex === null) return
        event.preventDefault()
        const next = sections[nextIndex].id
        onChange(next)
        document.getElementById(`authoring-${next}-tab`)?.focus()
      }}
    >
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      <small aria-hidden="true">{id === 'flow' ? `${nodeCount} カード` : `${stepCount} 手順`}</small>
    </button>)}
  </div>
}
