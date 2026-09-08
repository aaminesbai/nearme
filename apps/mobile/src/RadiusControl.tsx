import RadiusSlider from './RadiusSlider';
import { Text, View } from 'react-native';
import { formatDistance } from '@nearme/shared';
import { colors, Icon, s } from './ui';
import { useApp } from './state';
export function RadiusControl() {
  const radius = useApp((state) => state.radius);
  const count = useApp((state) => state.nearby.length);
  return (
    <View style={{ gap: 9 }}>
      <View style={s.between}>
        <View style={s.row}>
          <Icon name="scan-circle-outline" size={21} color={colors.accent} />
          <Text style={{ fontSize: 14, color: colors.ink, fontWeight: '600' }}>
            Rayon de decouverte
          </Text>
        </View>
        <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '800' }}>
          {formatDistance(radius)}
        </Text>
      </View>
      <RadiusSlider value={radius} onChange={(value) => useApp.setState({ radius: value })} />
      <View style={s.between}>
        <Text style={s.muted}>50 m</Text>
        <Text style={s.muted}>5 km</Text>
      </View>
      <View style={s.divider} />
      <View style={s.row}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} />
        <Text style={s.muted}>
          {count} {count > 1 ? 'personnes proches' : 'personne proche'}
        </Text>
      </View>
    </View>
  );
}
