import { HashRouter, Route, Routes } from 'react-router-dom';
import WallsList from './screens/WallsList';
import CaptureImport from './screens/CaptureImport';
import DetectionTuning from './screens/DetectionTuning';
import WallDetail from './screens/WallDetail';
import RouteEditor from './screens/RouteEditor';
import RouteView from './screens/RouteView';
import Settings from './screens/Settings';
import { useOnlineStatus } from './hooks/useOnlineStatus';

function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-yellow-900/90 px-4 py-1.5 text-center text-xs text-yellow-100">
      Offline — using saved data
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-dvh bg-neutral-950 text-neutral-50">
        <OfflineBanner />
        <Routes>
          <Route path="/" element={<WallsList />} />
          <Route path="/capture" element={<CaptureImport />} />
          <Route path="/walls/:wallId" element={<WallDetail />} />
          <Route path="/walls/:wallId/detect" element={<DetectionTuning />} />
          <Route path="/walls/:wallId/routes/:routeId" element={<RouteEditor />} />
          <Route path="/routes/:routeId/view" element={<RouteView />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
