import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDistance, type Conversation } from '@nearme/shared';
import { useApp } from '../../src/state';
import { api, queryClient } from '../../src/api';
import {
  Avatar,
  Button,
  colors,
  Empty,
  ErrorText,
  Field,
  Icon,
  IconButton,
  Loading,
  s,
} from '../../src/ui';
export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { nearby, user, ready } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [action, setAction] = useState<'block' | 'report' | null>(null);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);
  const chats = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<Conversation[]>('/conversations'),
    enabled: !!user?.charterAccepted,
  });
  const near = nearby.find((person) => person.id === id);
  const person = near ?? chats.data?.find((c) => c.peer.id === id)?.peer;
  if (!ready) return <Loading />;
  if (!user?.charterAccepted) return <Redirect href="/" />;
  async function chat() {
    setBusy(true);
    setError(null);
    try {
      const conversation = await api<{ id: string }>(`/conversations/with/${id}`, {
        method: 'POST',
      });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      router.replace(`/chat/${conversation.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function submitAction() {
    setBusy(true);
    setError(null);
    try {
      await api(`/users/${id}/${action}`, {
        method: 'POST',
        ...(action === 'report' ? { body: { reason } } : {}),
      });
      if (action === 'block') {
        useApp.setState({ nearby: nearby.filter((u) => u.id !== id) });
        await queryClient.invalidateQueries();
        router.replace('/(tabs)/nearby');
      } else {
        setReported(true);
        setAction(null);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={[s.content, { maxWidth: 520, width: '100%', alignSelf: 'center' }]}
      >
        <View style={s.between}>
          <Text style={s.label}>UNE NOUVELLE RENCONTRE</Text>
          <IconButton name="close" label="Fermer" onPress={() => router.back()} />
        </View>
        {!person ? (
          <Empty title="Cette personne n'est plus a proximite." />
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 14, paddingVertical: 30 }}>
              <Avatar avatar={person.avatar} size={132} online={near?.online} />
              <Text style={s.title}>{person.displayName}</Text>
              <Text style={s.muted}>
                @{person.isDemo ? person.displayName.toLowerCase() + '_demo' : person.username}
              </Text>
              {near && (
                <View style={s.row}>
                  <Icon name="location-outline" color={colors.accent} size={18} />
                  <Text style={s.label}>A environ {formatDistance(near.distance)}</Text>
                </View>
              )}
              {person.isDemo && <Text style={s.muted}>Profil de demonstration</Text>}
            </View>
            <View style={{ gap: 12, paddingBottom: 16 }}>
              <Text style={s.h2}>Quelques mots</Text>
              <Text style={s.body}>
                {person.bio || 'Les meilleures histoires commencent par un simple bonjour.'}
              </Text>
            </View>
            <Button
              title="Discuter"
              icon="chatbubble-ellipses-outline"
              loading={busy}
              onPress={() => void chat()}
            />
            <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>
              Un premier message. Le reste, a vous de l'ecrire.
            </Text>
            <View style={s.divider} />
            {reported ? (
              <Text style={s.body}>
                Signalement enregistre. Merci de prendre soin de la communaute.
              </Text>
            ) : (
              <Button
                title="Signaler"
                secondary
                icon="flag-outline"
                onPress={() => setAction('report')}
              />
            )}
            <Button
              title="Bloquer cette personne"
              secondary
              icon="ban-outline"
              onPress={() => setAction('block')}
            />
            {action && (
              <View style={{ gap: 12 }}>
                <Text style={s.body}>
                  {action === 'block'
                    ? "Cette personne ne pourra plus te voir ni t'envoyer de messages."
                    : "Que s'est-il passe ?"}
                </Text>
                {action === 'report' && (
                  <Field
                    label="Motif du signalement"
                    value={reason}
                    onChangeText={setReason}
                    maxLength={1000}
                    multiline
                  />
                )}
                <Button
                  title={action === 'block' ? 'Confirmer le blocage' : 'Envoyer le signalement'}
                  disabled={action === 'report' && reason.trim().length < 3}
                  loading={busy}
                  onPress={() => void submitAction()}
                />
                <Button title="Annuler" secondary onPress={() => setAction(null)} />
              </View>
            )}
          </>
        )}
        <ErrorText error={error} />
      </ScrollView>
    </SafeAreaView>
  );
}
