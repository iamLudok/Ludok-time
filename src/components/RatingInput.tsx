// Valoración de 0 a 10 mostrada como 5 estrellas (media estrella = 1 punto).
// Para simplicidad interactiva usamos 5 estrellas con incrementos de 2 puntos.

export default function RatingInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <div className="row" style={{ gap: 10 }}>
      <div className="stars">
        {stars.map((s) => {
          const points = s * 2
          const on = value >= points
          return (
            <button
              key={s}
              className={on ? 'on' : ''}
              onClick={() => onChange(value === points ? points - 1 : points)}
              aria-label={`${points} de 10`}
              title={`${points}/10`}
            >
              ★
            </button>
          )
        })}
      </div>
      <span className="muted">{value > 0 ? `${value}/10` : 'sin valorar'}</span>
      {value > 0 && (
        <button className="btn btn-sm" onClick={() => onChange(0)}>
          Quitar
        </button>
      )}
    </div>
  )
}
