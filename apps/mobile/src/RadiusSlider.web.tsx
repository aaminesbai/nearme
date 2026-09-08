import { colors } from './ui';
export default function RadiusSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      aria-label="Rayon de decouverte"
      min={50}
      max={5000}
      step={50}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{
        height: 36,
        width: '100%',
        margin: 0,
        accentColor: colors.accent,
        cursor: 'pointer',
      }}
    />
  );
}
