import { motion } from 'framer-motion';
import {
  MousePointer2,
  ArrowUpRight,
  Square,
  Circle,
  Pencil,
  Type,
  Eraser,
  Trash2,
  Minus,
  type LucideIcon,
} from 'lucide-react';
import type { Tool } from '../lib/types';

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  onClear: () => void;
}

interface ToolDef {
  id: Tool;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Sélection / déplacer', hint: 'V', icon: MousePointer2 },
  { id: 'arrow', label: 'Flèche', hint: 'A', icon: ArrowUpRight },
  { id: 'rect', label: 'Rectangle', hint: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', hint: 'E', icon: Circle },
  { id: 'freehand', label: 'Dessin libre', hint: 'P', icon: Pencil },
  { id: 'text', label: 'Texte', hint: 'T', icon: Type },
  { id: 'eraser', label: 'Gomme', hint: 'G', icon: Eraser },
];

const PALETTE = ['#ff5c7c', '#38bdf8', '#34d399', '#fbbf24', '#a78bfa', '#ffffff'];

export function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  onClear,
}: Props) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Outils d'annotation">
      <div className="toolbar-group">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              className={`tool-btn ${active ? 'active' : ''}`}
              aria-pressed={active}
              onClick={() => setTool(t.id)}
            >
              {active && (
                <motion.span
                  layoutId="tool-active"
                  className="tool-active-bg"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                />
              )}
              <Icon size={18} strokeWidth={2.1} />
              <span className="tool-tip">
                {t.label} <kbd>{t.hint}</kbd>
              </span>
            </button>
          );
        })}
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group" aria-label="Couleur">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={`swatch ${color === c ? 'active' : ''}`}
            style={{ background: c }}
            aria-label={`Couleur ${c}`}
            onClick={() => setColor(c)}
          >
            {color === c && (
              <motion.span
                layoutId="swatch-ring"
                className="swatch-ring"
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      <label className="stroke-control" title="Épaisseur du trait">
        <Minus size={16} />
        <input
          type="range"
          min={1}
          max={10}
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
        />
        <span className="stroke-value">{strokeWidth}</span>
      </label>

      <div className="toolbar-spacer" />

      <button className="tool-btn danger" onClick={onClear}>
        <Trash2 size={17} strokeWidth={2.1} />
        <span className="tool-tip">Tout effacer</span>
      </button>
    </div>
  );
}
