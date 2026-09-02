/**
 * Glifos propios para cada juego. NO son los logos oficiales: esos son marcas
 * registradas y no se empaquetan en el repo. Evocan la paleta de cada juego lo
 * suficiente para que la lista se lea de un vistazo.
 */
export default function GameMark({ gameId }: { gameId: string }) {
  if (gameId === "magic") {
    // Los cinco colores de maná en pentágono.
    const colors = ["#f8f3d8", "#a9d8f0", "#4b4a4c", "#f0a08a", "#9ec9a0"];
    const points = [
      [16, 5],
      [26, 12.5],
      [22, 24.5],
      [10, 24.5],
      [6, 12.5],
    ];
    return (
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        {points.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="4.6"
            fill={colors[i]}
            stroke="#11242f"
            strokeOpacity="0.28"
            strokeWidth="0.9"
          />
        ))}
      </svg>
    );
  }

  if (gameId === "pokemon") {
    return (
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <circle cx="16" cy="16" r="12" fill="#f6f7f9" stroke="#11242f" strokeWidth="1.6" />
        <path d="M4 16a12 12 0 0 1 24 0Z" fill="#e0483c" />
        <path d="M4 16h24" stroke="#11242f" strokeWidth="1.6" />
        <circle cx="16" cy="16" r="4" fill="#f6f7f9" stroke="#11242f" strokeWidth="1.6" />
      </svg>
    );
  }

  if (gameId === "yugioh") {
    return (
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect
          x="6.5"
          y="3.5"
          width="19"
          height="25"
          rx="2.5"
          fill="#7c5a2a"
          stroke="#11242f"
          strokeWidth="1.4"
        />
        <path d="M16 8.5 22 16l-6 7.5L10 16Z" fill="#e8c073" />
        <circle cx="16" cy="16" r="2.2" fill="#7c5a2a" />
      </svg>
    );
  }

  return (
    <span className="grid h-8 w-8 place-items-center rounded-sm border border-line bg-surface-2 text-[11px] font-bold text-muted">
      {gameId.slice(0, 2).toUpperCase()}
    </span>
  );
}
