import { Link } from 'react-router-dom';

export default function CaptureImport() {
  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-neutral-400">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">New wall</h1>
      </header>
      <p className="text-neutral-400">
        Capture / import comes in M2: camera capture, EXIF normalisation, downscale to 2000px,
        blob storage.
      </p>
    </div>
  );
}
