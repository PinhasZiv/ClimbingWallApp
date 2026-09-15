import { HashRouter, Route, Routes } from 'react-router-dom';
import WallsList from './screens/WallsList';
import CaptureImport from './screens/CaptureImport';
import DetectionTuning from './screens/DetectionTuning';
import WallDetail from './screens/WallDetail';
import RouteEditor from './screens/RouteEditor';
import RouteView from './screens/RouteView';

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-dvh bg-neutral-950 text-neutral-50">
        <Routes>
          <Route path="/" element={<WallsList />} />
          <Route path="/capture" element={<CaptureImport />} />
          <Route path="/walls/:wallId" element={<WallDetail />} />
          <Route path="/walls/:wallId/detect" element={<DetectionTuning />} />
          <Route path="/walls/:wallId/routes/:routeId" element={<RouteEditor />} />
          <Route path="/routes/:routeId/view" element={<RouteView />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
