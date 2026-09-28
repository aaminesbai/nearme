import { Redirect, Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useApp } from '../../src/state';
import { colors, GlassSurface, Icon, Loading } from '../../src/ui';
export default function TabLayout() {
  const { user, ready, connected } = useApp();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/onboarding" />;
  if (!user.charterAccepted) return <Redirect href="/charter" />;
  return (
    <View style={{ flex: 1 }}>
      {!connected && (
        <View
          style={{
            paddingTop: 8,
            paddingBottom: 6,
            backgroundColor: '#FFF0DA',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#805B25', fontSize: 12 }}>Connexion en cours...</Text>
        </View>
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarBackground: () => (
            <GlassSurface
              style={{
                flex: 1,
                padding: 0,
                gap: 0,
                borderRadius: 0,
                borderWidth: 0,
                backgroundColor: 'rgba(255,255,255,0.72)',
              }}
            />
          ),
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            height: 78,
            paddingTop: 10,
            paddingBottom: 14,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Explorer',
            tabBarIcon: ({ color }) => <Icon name="map-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="nearby"
          options={{
            title: 'Tout pres',
            tabBarIcon: ({ color }) => <Icon name="people-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="chats"
          options={{
            title: 'Messages',
            tabBarIcon: ({ color }) => <Icon name="chatbubbles-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Mon profil',
            tabBarIcon: ({ color }) => <Icon name="person-outline" color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
