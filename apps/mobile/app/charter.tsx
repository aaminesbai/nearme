import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import type { User } from '@nearme/shared';
import { api } from '../src/api';
import { useApp } from '../src/state';
import { Button, colors, ErrorText, Icon, s, type IconName } from '../src/ui';
const points: [IconName, string, string][] = [
  [
    'heart-outline',
    'Un peu de respect, beaucoup de lien.',
    "Pas de harcelement, de menaces ou d'usurpation d'identite.",
  ],
  [
    'location-outline',
    'Proches, en toute confiance.',
    "Ta position approximative te rend visible aux personnes proches. Jamais pour suivre quelqu'un.",
  ],
  [
    'shield-checkmark-outline',
    'Ton espace, tes limites.',
    'Tu peux devenir invisible, bloquer ou signaler un comportement dangereux.',
  ],
];
export default function Charter() {
  const user = useApp((state) => state.user);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!user) return <Redirect href="/onboarding" />;
  if (user.charterAccepted) return <Redirect href="/(tabs)" />;
  async function accept() {
    setBusy(true);
    try {
      await useApp.getState().setUser(await api<User>('/users/me/charter', { method: 'POST' }));
      router.replace('/(tabs)');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { flexGrow: 1, maxWidth: 520, width: '100%', alignSelf: 'center', paddingTop: 36 },
        ]}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: colors.mint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="heart-half-outline" color={colors.accent} size={36} />
        </View>
        <Text style={s.label}>NOTRE PETIT PACTE</Text>
        <Text style={s.title}>
          Bienvenue,{'\n'}
          {user.displayName}.
        </Text>
        <Text style={s.body}>
          Ici, on decouvre les personnes autour de soi. Et on prend soin les uns des autres.
        </Text>
        <View style={{ gap: 24, paddingVertical: 10 }}>
          {points.map(([icon, title, detail]) => (
            <View key={title} style={[s.row, { alignItems: 'flex-start' }]}>
              <Icon name={icon} color={colors.accent} />
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{title}</Text>
                <Text style={s.muted}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={() => setChecked(!checked)}
          style={[s.row, { paddingVertical: 10 }]}
        >
          <Icon name={checked ? 'checkbox' : 'square-outline'} color={colors.accent} size={28} />
          <Text style={[s.body, { flex: 1 }]}>J'ai lu et j'accepte la charte</Text>
        </Pressable>
        <ErrorText error={error} />
        <Button
          title="Entrer dans l'app"
          icon="arrow-forward"
          disabled={!checked}
          loading={busy}
          onPress={() => void accept()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
