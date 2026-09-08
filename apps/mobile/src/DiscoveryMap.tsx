import { memo, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import type { NearbyUser, Point } from '@nearme/shared';
import { Avatar, colors } from './ui';
export interface MapProps {
  point: Point;
  users: NearbyUser[];
  radius: number;
  recenter: number;
  onSelect: (user: NearbyUser) => void;
}
export default function DiscoveryMap({ point, users, radius, recenter, onSelect }: MapProps) {
  const map = useRef<MapView>(null);
  useEffect(() => {
    map.current?.animateToRegion({ ...point, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 650);
  }, [point.latitude, point.longitude, recenter]);
  return (
    <MapView
      ref={map}
      style={{ flex: 1 }}
      initialRegion={{ ...point, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
      showsCompass={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      <Circle
        center={point}
        radius={radius}
        fillColor="rgba(8,127,112,0.10)"
        strokeColor="rgba(8,127,112,0.55)"
        strokeWidth={2}
      />
      <Marker coordinate={point} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 4,
              borderColor: 'white',
              backgroundColor: colors.accent,
            }}
          />
          <Text style={{ fontWeight: '700', fontSize: 11, color: colors.accent }}>TOI</Text>
        </View>
      </Marker>
      {users.map((user) => (
        <PersonMarker key={user.id} user={user} onSelect={onSelect} />
      ))}
    </MapView>
  );
}
const PersonMarker = memo(function PersonMarker({
  user,
  onSelect,
}: {
  user: NearbyUser;
  onSelect: MapProps['onSelect'];
}) {
  return (
    <Marker coordinate={user} onPress={() => onSelect(user)} title={user.displayName}>
      <View
        style={{
          padding: 3,
          backgroundColor: 'white',
          borderRadius: 32,
          borderWidth: 2,
          borderColor: colors.coral,
        }}
      >
        <Avatar avatar={user.avatar} size={42} />
      </View>
    </Marker>
  );
});
