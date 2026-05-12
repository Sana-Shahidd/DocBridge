import { useState } from 'react';

// ── Body part definitions (front-view silhouette, viewBox 0 0 220 440) ────────
const BODY_PARTS = [
  {
    id: 'head', label: 'Head', phrase: 'head pain and headache',
    type: 'circle', props: { cx: 110, cy: 41, r: 36 },
  },
  {
    id: 'neck', label: 'Neck / Throat', phrase: 'neck pain and sore throat',
    type: 'rect', props: { x: 97, y: 77, width: 26, height: 22, rx: 5 },
  },
  {
    id: 'left-shoulder', label: 'L. Shoulder', phrase: 'left shoulder pain',
    type: 'ellipse', props: { cx: 66, cy: 103, rx: 22, ry: 11 },
  },
  {
    id: 'right-shoulder', label: 'R. Shoulder', phrase: 'right shoulder pain',
    type: 'ellipse', props: { cx: 154, cy: 103, rx: 22, ry: 11 },
  },
  {
    id: 'left-chest', label: 'L. Chest', phrase: 'left-sided chest pain',
    type: 'rect', props: { x: 76, y: 97, width: 32, height: 58, rx: 4 },
  },
  {
    id: 'right-chest', label: 'R. Chest', phrase: 'right-sided chest pain',
    type: 'rect', props: { x: 112, y: 97, width: 32, height: 58, rx: 4 },
  },
  {
    id: 'abdomen', label: 'Abdomen', phrase: 'abdominal pain and nausea',
    type: 'rect', props: { x: 77, y: 155, width: 66, height: 54, rx: 4 },
  },
  {
    id: 'lower-abdomen', label: 'Lower Abdomen', phrase: 'lower abdominal pain',
    type: 'rect', props: { x: 79, y: 209, width: 62, height: 44, rx: 4 },
  },
  {
    id: 'left-arm', label: 'L. Arm', phrase: 'left arm pain and weakness',
    type: 'rect', props: { x: 44, y: 97, width: 25, height: 150, rx: 10 },
  },
  {
    id: 'right-arm', label: 'R. Arm', phrase: 'right arm pain and weakness',
    type: 'rect', props: { x: 151, y: 97, width: 25, height: 150, rx: 10 },
  },
  {
    id: 'left-thigh', label: 'L. Thigh', phrase: 'left thigh and hip pain',
    type: 'rect', props: { x: 79, y: 253, width: 29, height: 88, rx: 8 },
  },
  {
    id: 'right-thigh', label: 'R. Thigh', phrase: 'right thigh and hip pain',
    type: 'rect', props: { x: 112, y: 253, width: 29, height: 88, rx: 8 },
  },
  {
    id: 'left-leg', label: 'L. Knee / Leg', phrase: 'left knee and lower leg pain',
    type: 'rect', props: { x: 80, y: 341, width: 27, height: 92, rx: 8 },
  },
  {
    id: 'right-leg', label: 'R. Knee / Leg', phrase: 'right knee and lower leg pain',
    type: 'rect', props: { x: 113, y: 341, width: 27, height: 92, rx: 8 },
  },
];

const DEFAULT_FILL   = '#F5E6D8';
const HOVER_FILL     = '#BFDBFE';
const SELECTED_FILL  = '#3B82F6';
const DEFAULT_STROKE = '#D4A89A';
const SELECTED_STROKE = '#1D4ED8';

function BodyShape({ part, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }) {
  const fill   = isSelected ? SELECTED_FILL  : isHovered ? HOVER_FILL  : DEFAULT_FILL;
  const stroke = isSelected ? SELECTED_STROKE : DEFAULT_STROKE;
  const common = {
    fill,
    stroke,
    strokeWidth: isSelected ? 2 : 1,
    style: { cursor: 'pointer', transition: 'fill 0.15s, stroke 0.15s' },
    onClick,
    onMouseEnter,
    onMouseLeave,
  };

  const { type, props } = part;
  if (type === 'circle')  return <circle  {...props} {...common} />;
  if (type === 'ellipse') return <ellipse {...props} {...common} />;
  return                         <rect    {...props} {...common} />;
}

export default function BodyDiagram({ onBodyPartClick }) {
  const [selected, setSelected] = useState(new Set());
  const [hovered,  setHovered]  = useState(null);
  const [tooltip,  setTooltip]  = useState({ visible: false, label: '', x: 0, y: 0 });

  function handleClick(part) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(part.id)) {
        next.delete(part.id);
      } else {
        next.add(part.id);
      }
      return next;
    });
    onBodyPartClick(part.phrase, !selected.has(part.id));
  }

  function handleMouseEnter(part, e) {
    setHovered(part.id);
    const svgRect = e.currentTarget.closest('svg').getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    const y = e.clientY - svgRect.top;
    setTooltip({ visible: true, label: part.label, x, y });
  }

  function handleMouseMove(e) {
    if (!hovered) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    const y = e.clientY - svgRect.top;
    setTooltip((t) => ({ ...t, x, y }));
  }

  function handleMouseLeave() {
    setHovered(null);
    setTooltip({ visible: false, label: '', x: 0, y: 0 });
  }

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <p className="text-xs text-gray-500 font-medium text-center">
        Click body parts to add to description
      </p>

      <div className="relative inline-block">
        <svg
          viewBox="0 0 220 440"
          width="180"
          height="360"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="overflow-visible"
        >
          {/* ── Silhouette base outline (non-interactive) ── */}
          <g opacity="0.15" fill={DEFAULT_FILL} stroke={DEFAULT_STROKE} strokeWidth="1">
            {/* torso connector */}
            <rect x="76" y="97" width="68" height="158" rx="4" />
          </g>

          {/* ── Clickable body parts ── */}
          {BODY_PARTS.map((part) => (
            <BodyShape
              key={part.id}
              part={part}
              isSelected={selected.has(part.id)}
              isHovered={hovered === part.id}
              onClick={() => handleClick(part)}
              onMouseEnter={(e) => handleMouseEnter(part, e)}
              onMouseLeave={handleMouseLeave}
            />
          ))}

          {/* ── Selected count badge ── */}
          {selected.size > 0 && (
            <g>
              <circle cx="195" cy="15" r="13" fill="#3B82F6" />
              <text
                x="195" y="20"
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="white"
              >
                {selected.size}
              </text>
            </g>
          )}

          {/* ── Tooltip ── */}
          {tooltip.visible && (
            <g transform={`translate(${Math.min(tooltip.x + 8, 170)}, ${Math.max(tooltip.y - 28, 5)})`}>
              <rect x="0" y="0" width="90" height="22" rx="4" fill="#1E3A8A" opacity="0.9" />
              <text x="45" y="15" textAnchor="middle" fontSize="11" fill="white" fontWeight="500">
                {tooltip.label}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Selected parts list */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-[200px]">
          {BODY_PARTS.filter((p) => selected.has(p.id)).map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium"
            >
              {p.label}
              <button
                onClick={() => handleClick(p)}
                className="text-blue-400 hover:text-blue-700 leading-none"
                aria-label={`Remove ${p.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
