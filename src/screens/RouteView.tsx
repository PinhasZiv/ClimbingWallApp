import { Link, useParams } from 'react-router-dom';

export default function RouteView() {
  const { routeId } = useParams();
  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-neutral-400">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">Route view</h1>
      </header>
      <p className="text-neutral-400">
        Route {routeId}: read-only glance view with wake lock arrives in M6.
      </p>
    </div>
  );
}
