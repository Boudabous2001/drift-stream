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

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Sélection (déplacer la vidéo)', icon: '✋' },
  { id: 'arrow', label: 'Flèche', icon: '↗' },
  { id: 'rect', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯' },
  { id: 'freehand', label: 'Dessin libre', icon: '✎' },
  { id: 'text', label: 'Texte', icon: 'T' },
];

const PALETTE = ['#ff5c7c', '#36c5f0', '#2eb67d', '#ecb22e', '#a970ff', '#ffffff'];

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
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            title={t.label}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            <span className="tool-icon">{t.icon}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group" aria-label="Couleur">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={`swatch ${color === c ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            aria-label={`Couleur ${c}`}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      <div className="toolbar-sep" />

      <label className="stroke-control" title="Épaisseur du trait">
        <span className="stroke-icon">●</span>
        <input
          type="range"
          min={1}
          max={10}
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
        />
      </label>

      <div className="toolbar-spacer" />

      <button className="tool-btn danger" title="Tout effacer" onClick={onClear}>
        🗑
      </button>
    </div>
  );
}
