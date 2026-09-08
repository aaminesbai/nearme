import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { NearbyUser } from '@nearme/shared';
import DiscoveryMap from '../../src/DiscoveryMap';
import { RadiusControl } from '../../src/RadiusControl';
import { DEMO, useApp } from '../../src/state';
import { locate } from '../../src/location';
import { Avatar, Button, colors, Empty, ErrorText, IconButton, Loading, s } from '../../src/ui';
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
          <View
            style={{
              backgroundColor: 'white',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}
          >
            <Text style={s.label}>LES RENCONTRES DU COIN</Text>
            <Text style={[s.h2, { marginTop: 3 }]}>
              NearMe<Text style={{ color: colors.coral }}>.</Text>
            </Text>
          </View>
          <View style={{ padding: 4, backgroundColor: 'white', borderRadius: 32 }}>
            {user && <Avatar avatar={user.avatar} size={44} online={user.visible} />}
          </View>
        </View>
        {locationState === 'demo' && (
          <Text
            style={{
              alignSelf: 'flex-start',
              backgroundColor: '#FFF0DA',
              padding: 8,
              borderRadius: 8,
              color: '#805B25',
              fontSize: 12,
            }}
          >
            Bordeaux · mode demo
          </Text>
        )}
        {user?.visible === false && (
          <Text style={{ backgroundColor: 'white', padding: 10, color: colors.muted }}>
            Tu es invisible pour les autres.
          </Text>
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
          <View
            style={{
              position: 'absolute',
              top: insets.top + 120,
              left: 22,
              right: 22,
              backgroundColor: 'white',
              padding: 12,
              borderRadius: 8,
              gap: 8,
            }}
          >
            <Text style={s.muted}>Position non actualisee.</Text>
            <ErrorText error={locationError} />
            <Button title="Actualiser" onPress={() => void locate()} />
          </View>
        )}
      {point && (
        <View
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            maxWidth: 420,
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 20,
            boxShadow: '0 6px 28px rgba(25,58,55,0.12)',
          }}
        >
          <RadiusControl />
        </View>
      )}
    </View>
  );
}
