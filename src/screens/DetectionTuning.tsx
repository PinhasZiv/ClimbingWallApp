import { Link, useParams } from 'react-router-dom';

export default function DetectionTuning() {
  const { wallId } = useParams();
  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-neutral-400">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">Detection &amp; tuning</h1>
      </header>
      <p className="text-neutral-400">
        Wall {wallId}: hold detection pipeline arrives in M4, manual holds in M3.
      </p>
    </div>
  );
}
