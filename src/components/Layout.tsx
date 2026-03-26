import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary bg-bg-secondary px-6 py-3">
        <Link to="/" className="text-xl font-bold">
          Refra
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/assets" className="rounded border border-border-primary px-3 py-2 hover:bg-bg-tertiary">
            アセット一覧
          </Link>
          <Link to="/upload" className="rounded border border-border-primary px-3 py-2 hover:bg-bg-tertiary">
            アップロード
          </Link>
          <Link to="/settings" className="rounded border border-border-primary px-3 py-2 hover:bg-bg-tertiary">
            設定
          </Link>
          <Link to="/compare" className="rounded border border-border-primary px-3 py-2 hover:bg-bg-tertiary">
            比較表示
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
