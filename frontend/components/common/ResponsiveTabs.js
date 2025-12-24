'use client';

/**
 * ResponsiveTabs - Shows tabs on desktop, select dropdown on mobile
 * 
 * Usage:
 * <ResponsiveTabs
 *   tabs={[
 *     { key: 'tab1', label: 'Tab 1', icon: <Icon /> },
 *     { key: 'tab2', label: 'Tab 2', icon: <Icon /> },
 *   ]}
 *   activeTab="tab1"
 *   onChange={(key) => setActiveTab(key)}
 * />
 */

export default function ResponsiveTabs({
  tabs = [],
  activeTab,
  onChange,
  className = '',
}) {
  const activeTabData = tabs.find(t => t.key === activeTab) || tabs[0];

  return (
    <>
      {/* Mobile Select - hidden on desktop */}
      <div className="md:hidden p-3 border-b border-gray-200">
        <select
          value={activeTab}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {tabs.map((tab) => (
            <option key={tab.key} value={tab.key}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop Tabs - hidden on mobile */}
      <div className={`hidden md:block border-b border-gray-200 ${className}`}>
        <nav className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon && <span className="inline mr-2">{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
