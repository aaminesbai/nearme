import Slider from '@react-native-community/slider';
import { colors } from './ui';
export default function RadiusSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Slider
      accessibilityLabel="Rayon de decouverte"
      minimumValue={50}
      maximumValue={5000}
      step={50}
      value={value}
      onValueChange={onChange}
      minimumTrackTintColor={colors.accent}
      maximumTrackTintColor={colors.line}
      thumbTintColor={colors.accent}
      style={{ height: 36, width: '100%' }}
    />
  );
}
