import { useEffect } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useSettings } from './lib/settings'
import BackupBanner from './components/BackupBanner'
import Library from './pages/Library'
import Search from './pages/Search'
import SeriesDetail from './pages/SeriesDetail'
import MovieDetail from './pages/MovieDetail'
import BookDetail from './pages/BookDetail'
import Videos from './pages/Videos'
import Stats from './pages/Stats'
import SettingsPage from './pages/Settings'

function useThemeEffect(theme: 'dark' | 'light' | 'system') {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.setAttribute('data-theme', dark ? 'dark' : 'light')
    }
    apply()
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme])
}

export default function App() {
  const settings = useSettings()
  useThemeEffect(settings.theme)

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Ludok<span className="brand-dot">·</span>Time
        </h1>
      </header>

      <BackupBanner />

      <main className="content">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/search" element={<Search />} />
          <Route path="/series/:id" element={<SeriesDetail />} />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <nav className="nav">
        <NavLink to="/" end>
          <span className="ico">📚</span>Biblioteca
        </NavLink>
        <NavLink to="/search">
          <span className="ico">🔍</span>Añadir
        </NavLink>
        <NavLink to="/videos">
          <span className="ico">▶️</span>Vídeos
        </NavLink>
        <NavLink to="/stats">
          <span className="ico">📊</span>Stats
        </NavLink>
        <NavLink to="/settings">
          <span className="ico">⚙️</span>Ajustes
        </NavLink>
      </nav>
    </div>
  )
}
