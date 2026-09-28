import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import type { User } from '@nearme/shared';
import { api } from '../src/api';
import { useApp } from '../src/state';
import { Button, colors, ErrorText, GlassSurface, Icon, s, type IconName } from '../src/ui';
const points: [IconName, string, string][] = [
  [
    'heart-outline',
    'Respect et sécurité',
    "Pas de harcèlement, menaces, discrimination, contenu illégal ou usurpation d'identité. Bloque ou signale les comportements dangereux.",
  ],
  [
    'location-outline',
    'Ta position, sous ton contrôle',
    "La position est utilisée quand tu ouvres l'app et autorises la localisation. Le serveur conserve ta dernière position ; seuls les membres visibles à proximité reçoivent une position arrondie et une distance approximative. Une position qui n'a pas été actualisée depuis 12 minutes n'apparaît plus dans la découverte. Tu peux désactiver ta visibilité ou retirer l'autorisation dans les réglages du téléphone.",
  ],
  [
    'server-outline',
    'Données utilisées par NearMe',
    "Nous enregistrons ton pseudo, prénom affiché, avatar, bio, mot de passe sous forme de hash, choix de visibilité et version des conditions acceptées ; aucun e-mail ni numéro de téléphone n'est demandé. Si tu actives la localisation, sa dernière position est enregistrée. Les conversations, messages, blocages, signalements et jetons de notification sont conservés pour faire fonctionner les échanges, la sécurité et les notifications. Le jeton de session reste sur ton appareil ; le serveur n'en conserve que le hash.",
  ],
  [
    'share-social-outline',
    'Partage et prestataires',
    "Ton profil et ta position approximative sont montrés aux personnes proches visibles ; tes messages sont partagés avec les membres de la conversation. La carte web charge des tuiles auprès de CARTO/OpenStreetMap ; les cartes mobiles utilisent Apple Plans ou Google Maps. Les portraits sont hébergés par Pravatar et les notifications passent par Expo si tu les actives. NearMe ne vend pas tes données et n'intègre pas de publicité ciblée.",
  ],
  [
    'trash-outline',
    'Garde la main sur ton compte',
    "Le compte et son profil restent enregistrés tant qu'ils ne sont pas supprimés. La dernière position reste enregistrée jusqu'à son remplacement ou la suppression du compte ; après 12 minutes sans actualisation, elle n'est plus proposée dans la découverte. Les messages restent enregistrés jusqu'à la suppression du compte de l'un des participants, qui efface toute la conversation. Tu peux modifier ton prénom et ta bio, changer ta visibilité, bloquer, signaler ou supprimer ton compte depuis Mon profil. La suppression retire aussi les positions, les jetons push et les signalements liés au compte.",
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
        <Text style={s.label}>CONDITIONS D'UTILISATION & DONNÉES</Text>
        <Text style={s.title}>Bienvenue, {user.displayName}.</Text>
        <Text style={s.body}>
          NearMe t'aide à rencontrer les personnes autour de toi. Voici les règles et les données
          nécessaires au service.
        </Text>
        <View style={{ gap: 24, paddingVertical: 10 }}>
          {points.map(([icon, title, detail]) => (
            <GlassSurface key={title} style={[s.row, { alignItems: 'flex-start', padding: 18 }]}>
              <Icon name={icon} color={colors.accent} />
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{title}</Text>
                <Text style={s.muted}>{detail}</Text>
              </View>
            </GlassSurface>
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
          <Text style={[s.body, { flex: 1 }]}>
            J'ai lu et j'accepte les conditions d'utilisation et la politique de données
          </Text>
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
