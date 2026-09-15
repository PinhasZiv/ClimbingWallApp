import { Link, useParams } from 'react-router-dom';

export default function RouteEditor() {
  const { wallId, routeId } = useParams();
  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Link to={wallId ? `/walls/${wallId}` : '/'} className="text-neutral-400">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">Route editor</h1>
      </header>
      <p className="text-neutral-400">
        {routeId === 'new' ? 'New route' : `Route ${routeId}`} on wall {wallId}. Full zoom/pan/tap
        editor arrives in M3.
      </p>
    </div>
  );
}
