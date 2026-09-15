import { Link, useParams } from 'react-router-dom';
import { useWall } from '../hooks/useWalls';
import { useRoutesForWall } from '../hooks/useRoutes';

export default function WallDetail() {
  const { wallId } = useParams();
  const { wall, loading } = useWall(wallId);
  const { routes } = useRoutesForWall(wallId);

  if (loading) return <div className="p-4 text-neutral-400">Loading…</div>;
  if (!wall) return <div className="p-4 text-neutral-400">Wall not found.</div>;

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-neutral-400">
          ← Back
        </Link>
        <h1 className="truncate text-xl font-semibold">{wall.name}</h1>
      </header>

      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-400">{wall.holds.length} holds mapped</span>
        <Link
          to={`/walls/${wall.id}/detect`}
          className="rounded-full bg-neutral-800 px-3 py-1.5 text-sm"
        >
          Edit hold map
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-medium">Routes</h2>
        <Link
          to={`/walls/${wall.id}/routes/new`}
          className="rounded-full bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + New route
        </Link>
      </div>

      {routes && routes.length === 0 && (
        <p className="text-neutral-400">No routes set on this wall yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {routes?.map((route) => (
          <li key={route.id}>
            <Link
              to={`/walls/${wall.id}/routes/${route.id}`}
              className="flex items-center justify-between rounded-lg bg-neutral-800 px-3 py-2"
            >
              <span>{route.name}</span>
              <span className="text-sm text-neutral-400">{route.grade ?? 'ungraded'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
