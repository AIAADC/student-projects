import { Suspense, useEffect, useRef } from 'react'
import { Monitor, Moon, ShieldCheck, SlidersHorizontal, Sun } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CONFIG_SUB, CONFIG_TAB_IDS, LOWER_NAV, PRIMARY_NAV, TAB_TITLES, type Tab } from './boards/navConfig'
import { BrandMark } from './components/brand/BrandMark'
import { useTheme } from './hooks/useTheme'
import { nextThemePreference, type ThemePreference } from './hooks/themeModel'
import { pathForTab, tabForPath } from './app/navigation'
import './App.css'

const themeNames: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色模式',
  dark: '深色模式',
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { preference: themePreference, setPreference: setThemePreference } = useTheme()
  const activeTab = tabForPath(location.pathname)
  const isConfig = CONFIG_TAB_IDS.includes(activeTab)
  const lastConfig = useRef<Tab>('summary')
  useEffect(() => {
    if (isConfig) lastConfig.current = activeTab
  }, [activeTab, isConfig])

  const heading = TAB_TITLES[activeTab]
  const fullBleed = activeTab === 'overview' || activeTab === 'academics' || activeTab === 'chat'
  const workspaceClass = [
    'workspace',
    isConfig ? 'cfg' : '',
    activeTab === 'chat' ? 'chat-workspace' : '',
  ].filter(Boolean).join(' ')
  const nextTheme = nextThemePreference(themePreference)
  const ThemeIcon = themePreference === 'system' ? Monitor : themePreference === 'light' ? Sun : Moon

  const renderNav = (items: typeof PRIMARY_NAV, label: string) => (
    <nav className={`rail-nav${label === '配置' ? ' secondary' : ''}`} aria-label={label}>
      {items.map((item) => (
        <button
          aria-current={activeTab === item.id ? 'page' : undefined}
          key={item.id}
          className={activeTab === item.id ? 'rail-button active' : 'rail-button'}
          onClick={() => navigate(pathForTab(item.id))}
          title={item.label}
          type="button"
        >
          {item.icon}
          <span className="rail-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )

  return (
    <main className="app-shell">
      <aside className="left-rail">
        <div className="brand-mark" title="午夜书斋">
          <BrandMark />
        </div>
        {renderNav(PRIMARY_NAV, '成果')}
        <div className="rail-div" />
        <nav className="rail-nav secondary" aria-label="配置">
          <button
            aria-current={isConfig ? 'page' : undefined}
            className={isConfig ? 'rail-button active' : 'rail-button'}
            onClick={() => navigate(pathForTab(lastConfig.current))}
            title="配置"
            type="button"
          >
            <SlidersHorizontal size={20} />
            <span className="rail-label">配置</span>
          </button>
          {renderNav(LOWER_NAV, '工具')}
        </nav>
        <button
          aria-label={`当前${themeNames[themePreference]}，切换到${themeNames[nextTheme]}`}
          className="theme-cycle-button"
          onClick={() => setThemePreference(nextTheme)}
          title={`外观：${themeNames[themePreference]}`}
          type="button"
        >
          <ThemeIcon size={17} />
        </button>
      </aside>

      <section className={workspaceClass}>
        {!fullBleed && (
          <header className="topbar">
            <div>
              <p className="eyebrow">{heading.eyebrow}</p>
              <h1>{heading.title}</h1>
            </div>
            <div className="status-pill">
              <ShieldCheck size={16} />
              原始文件保留
            </div>
          </header>
        )}

        {isConfig && (
          <div className="config-subnav" role="tablist" aria-label="配置板块">
            {CONFIG_SUB.map((item) => (
              <button
                aria-current={activeTab === item.id ? 'page' : undefined}
                key={item.id}
                className={activeTab === item.id ? 'on' : ''}
                onClick={() => navigate(pathForTab(item.id))}
                role="tab"
                type="button"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        <Suspense fallback={<div className="empty" role="status">正在打开页面…</div>}>
          <Outlet />
        </Suspense>
      </section>
    </main>
  )
}

export default App
