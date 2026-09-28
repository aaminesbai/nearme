import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { NearbyUser } from '@nearme/shared';
import DiscoveryMap from '../../src/DiscoveryMap';
import { RadiusControl } from '../../src/RadiusControl';
import { DEMO, useApp } from '../../src/state';
import { locate } from '../../src/location';
import {
  Avatar,
  Button,
  colors,
  Empty,
  ErrorText,
  GlassSurface,
  IconButton,
  Loading,
  s,
} from '../../src/ui';
export default function MapScreen() {
  const { point, nearby, radius, user, locationState, locationError } = useApp();
  const insets = useSafeAreaInsets();
  const [recenter, setRecenter] = useState(0);
  const select = useCallback((person: NearbyUser) => router.push(`/person/${person.id}`), []);
  return (
    <View style={s.page}>
      {point ? (
        <DiscoveryMap
          point={point}
          users={nearby}
          radius={radius}
          recenter={recenter}
          onSelect={select}
        />
      ) : (
        <ScrollView
          style={{ flex: 1, marginTop: insets.top + 110 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        >
          {locationState === 'loading' ? (
            <Loading />
          ) : (
            <Empty icon="location-outline" title="Le monde, tout pres.">
              <Text style={[s.muted, { textAlign: 'center' }]}>
                {locationState === 'denied'
                  ? 'Active ta localisation pour decouvrir les personnes autour de toi.'
                  : 'Partage ta position pour rencontrer les personnes autour de toi.'}
              </Text>
              <Button
                title={
                  locationState === 'denied' ? 'Ouvrir les reglages' : 'Activer ma localisation'
                }
                icon="location"
                onPress={() =>
                  locationState === 'denied' ? void Linking.openSettings() : void locate()
                }
              />
              {DEMO && (
                <Button title="Explorer Bordeaux" secondary onPress={() => void locate(true)} />
              )}
              <ErrorText error={locationError} />
            </Empty>
          )}
        </ScrollView>
      )}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + 16, left: 22, right: 22, gap: 12 }}
      >
        <View style={s.between}>
          <GlassSurface style={{ paddingHorizontal: 18, paddingVertical: 12, gap: 2 }}>
            <Text style={s.label}>LES RENCONTRES DU COIN</Text>
            <Text style={[s.h2, { marginTop: 3 }]}>
              NearMe<Text style={{ color: colors.coral }}>.</Text>
            </Text>
          </GlassSurface>
          <GlassSurface style={{ padding: 4, gap: 0, borderRadius: 32 }}>
            {user && <Avatar avatar={user.avatar} size={44} online={user.visible} />}
          </GlassSurface>
        </View>
        {locationState === 'demo' && (
          <GlassSurface
            style={{ alignSelf: 'flex-start', padding: 10, gap: 0 }}
            tintColor="#FFF0DA"
          >
            <Text style={{ color: '#805B25', fontSize: 12, fontWeight: '700' }}>
              Bordeaux · mode demo
            </Text>
          </GlassSurface>
        )}
        {user?.visible === false && (
          <GlassSurface style={{ padding: 12, gap: 0 }}>
            <Text style={s.muted}>Tu es invisible pour les autres.</Text>
          </GlassSurface>
        )}
      </View>
      {point && (
        <View style={{ position: 'absolute', right: 22, bottom: 240 }}>
          <IconButton
            name="locate-outline"
            label="Recentrer"
            onPress={() => setRecenter((v) => v + 1)}
          />
        </View>
      )}
      {point &&
        (locationState === 'error' || locationState === 'stale' || locationState === 'denied') && (
          <GlassSurface
            style={{
              position: 'absolute',
              top: insets.top + 120,
              left: 22,
              right: 22,
              padding: 16,
            }}
          >
            <Text style={s.muted}>Position non actualisee.</Text>
            <ErrorText error={locationError} />
            <Button title="Actualiser" onPress={() => void locate()} />
          </GlassSurface>
        )}
      {point && (
        <GlassSurface
          style={{
            position: 'absolute',
            bottom: insets.bottom + 96,
            left: 20,
            right: 20,
            maxWidth: 420,
            padding: 20,
            boxShadow: '0 6px 28px rgba(25,58,55,0.12)',
          }}
        >
          <RadiusControl />
        </GlassSurface>
      )}
    </View>
  );
}
