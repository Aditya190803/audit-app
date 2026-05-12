import React from 'react'
import { LayoutDashboard, Tag, AlertTriangle } from 'lucide-react'
import type { ReviewView, AuditAnalytics } from '../utils/auditAnalytics'
import { QuickStats } from './QuickStats'
import { ExceptionsView } from './ExceptionsView'
import { SummaryView } from './SummaryView'

interface AuditReviewPageProps {
  analytics: AuditAnalytics
  activeTab: ReviewView
  onTabChange: (tab: ReviewView) => void
  onExceptionFilter: (key: string, value: string) => void
}

const TABS: { key: ReviewView; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Overview', desc: 'KPIs & trends', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'summary', label: 'Tags', desc: 'Review by tag', icon: <Tag className="h-4 w-4" /> },
  { key: 'exceptions', label: 'Exceptions', desc: 'Anomalies', icon: <AlertTriangle className="h-4 w-4" /> },
]

export const AuditReviewPage: React.FC<AuditReviewPageProps> = ({
  analytics,
  activeTab,
  onTabChange,
  onExceptionFilter,
}) => {
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <QuickStats analytics={analytics} />
      case 'summary':
        return (
          <div className="max-w-5xl mx-auto mt-2">
            <SummaryView analytics={analytics} onFilterChange={onExceptionFilter} />
          </div>
        )
      case 'exceptions':
        return (
          <div className="max-w-5xl mx-auto mt-2">
            <ExceptionsView analytics={analytics} onFilterChange={onExceptionFilter} />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg)] overflow-hidden">
      {/* Horizontal Tabs Header */}
      <div className="px-6 pt-5 pb-0 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Audit Review</h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {analytics.filteredTransactions.length} transactions · {analytics.totals.tagged} tagged
            </p>
          </div>
          <div className="flex-1" />
          <div className="flex gap-1 bg-[var(--bg)] p-1 rounded-[var(--radius-lg)] border border-[var(--border)]">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => onTabChange(tab.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm ring-1 ring-[var(--border)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  <span className="text-[10px] opacity-60 hidden sm:inline">{tab.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="h-3" />
      </div>

      {/* Main Review Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">
        {renderContent()}
      </div>
    </div>
  )
}
