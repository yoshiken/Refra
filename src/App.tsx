import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Gallery from '@/routes/Gallery';
import AssetDetail from '@/routes/AssetDetail';
import Settings from '@/routes/Settings';
import Upload from '@/routes/Upload';
import Compare from '@/routes/Compare';
import SceneDetail from '@/routes/SceneDetail';
import { getSettings } from '@/stores/settingsStore';
import Layout from '@/components/Layout';

export default function App() {
  useEffect(() => {
    void (async () => {
      const settings = await getSettings();
      document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    })();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Gallery />} />
          <Route path="/asset/:id" element={<AssetDetail />} />
          <Route path="/scene/:assetId/:sceneId" element={<SceneDetail />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/compare" element={<Compare />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
