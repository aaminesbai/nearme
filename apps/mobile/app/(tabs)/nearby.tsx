import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { formatDistance } from '@nearme/shared';
import { useApp } from '../../src/state';
import { Avatar, colors, Empty, GlassSurface, Icon, s } from '../../src/ui';
import { RadiusControl } from '../../src/RadiusControl';
import { locate } from '../../src/location';
export default function Nearby() {
  const { nearby, radius, locationState } = useApp();
  return (
    <SafeAreaView edges={['top']} style={s.page}>
      <FlatList
        data={nearby}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          s.content,
          { maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 110 },
        ]}
        onRefresh={() => void locate(locationState === 'demo')}
        refreshing={locationState === 'loading'}
        ListHeaderComponent={
          <View style={{ gap: 20 }}>
            <View>
              <Text style={s.label}>UNE RENCONTRE A DEUX PAS</Text>
              <Text style={[s.title, { marginTop: 8 }]}>Tout pres de toi</Text>
              <Text style={[s.muted, { marginTop: 8 }]}>
                Des visages, des histoires. Un premier bonjour ?
              </Text>
            </View>
            <RadiusControl />
            <View style={s.between}>
              <Text style={s.h2}>Dans ton quartier</Text>
              <Text style={s.muted}>{nearby.length} personnes</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Empty title={`Personne dans un rayon de ${formatDistance(radius)} pour le moment.`}>
            <Text style={[s.muted, { textAlign: 'center' }]}>Un peu plus loin, peut-etre ?</Text>
          </Empty>
        }
        renderItem={({ item }) => (
          <GlassSurface style={{ padding: 0, gap: 0, marginTop: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Voir ${item.displayName}`}
              onPress={() => router.push(`/person/${item.id}`)}
              style={[s.row, { padding: 16 }]}
            >
              <Avatar avatar={item.avatar} size={68} online={item.online} />
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 19 }}>
                  {item.displayName}
                </Text>
                <Text style={s.muted}>
                  {item.online ? 'En ligne' : 'Récemment ici'}
                  {item.isDemo ? ' · Démo' : ''}
                </Text>
                <Text style={[s.label, { marginTop: 2 }]}>
                  À environ {formatDistance(item.distance)}
                </Text>
              </View>
              <Icon name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          </GlassSurface>
        )}
      />
    </SafeAreaView>
  );
}
