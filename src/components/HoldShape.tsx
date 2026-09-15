import type { Hold, HoldRole } from '../types/models';
import { ROLE_STYLES } from '../lib/holdStyles';

/** Neutral outline shown for unused/undetected-role holds so their shape is still visible while editing. */
const NEUTRAL_STROKE = 'rgba(255,255,255,0.35)';
const NEUTRAL_STROKE_WIDTH_PX = 2;

interface HoldShapeProps {
  hold: Hold;
  role: HoldRole;
  totalScale: number;
  showNeutralOutline?: boolean;
  selected?: boolean;
}

export default function HoldShape({
  hold,
  role,
  totalScale,
  showNeutralOutline = false,
  selected = false,
}: HoldShapeProps) {
  const style = ROLE_STYLES[role];
  const points = hold.polygon.map(([x, y]) => `${x},${y}`).join(' ');

  const strokeWidth = style.stroke
    ? style.strokeWidthPx / totalScale
    : showNeutralOutline
      ? NEUTRAL_STROKE_WIDTH_PX / totalScale
      : 0;
  const stroke = style.stroke ?? (showNeutralOutline ? NEUTRAL_STROKE : 'none');
  const badgeRadius = 9 / totalScale;

  return (
    <g>
      <polygon
        points={points}
        fill={style.fill ?? 'none'}
        fillOpacity={style.fillOpacity}
        stroke={selected ? '#ffffff' : stroke}
        strokeWidth={selected ? Math.max(strokeWidth, 3 / totalScale) : strokeWidth}
        strokeDasharray={style.dashed ? `${6 / totalScale} ${4 / totalScale}` : undefined}
        strokeLinejoin="round"
      />
      {style.badge && (
        <g transform={`translate(${hold.centroid[0]} ${hold.centroid[1]})`}>
          <circle r={badgeRadius} fill={style.stroke ?? '#000'} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11 / totalScale}
            fontWeight={700}
            fill="#0a0a0a"
          >
            {style.badge}
          </text>
        </g>
      )}
    </g>
  );
}
