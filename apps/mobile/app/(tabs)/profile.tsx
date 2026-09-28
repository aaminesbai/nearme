import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import type { User } from '@nearme/shared';
import { api, disconnectSocket, queryClient } from '../../src/api';
import { DEMO, useApp } from '../../src/state';
import { Avatar, Button, colors, ErrorText, Field, GlassSurface, Icon, s } from '../../src/ui';
import { locate } from '../../src/location';
import { registerNotifications } from '../../src/notifications';
export default function Profile() {
  const user = useApp((state) => state.user)!;
  const [name, setName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function update(body: Partial<User>) {
    setBusy(true);
    setError(null);
    try {
      const user = await api<User>('/users/me', { method: 'PATCH', body });
      await useApp.getState().setUser(user);
      await queryClient.invalidateQueries();
      setNotice('Profil mis a jour');
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function savePassword() {
    setAccountBusy(true);
    setError(null);
    try {
      await api('/users/me/password', {
        method: 'POST',
        body: { ...(currentPassword ? { currentPassword } : {}), newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Mot de passe mis à jour');
    } catch (passwordError) {
      setError(passwordError);
    } finally {
      setAccountBusy(false);
    }
  }
  async function signOut() {
    setAccountBusy(true);
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Clear the local session even when the server cannot be reached.
    } finally {
      disconnectSocket();
      queryClient.clear();
      await useApp.getState().clearSession();
      router.replace('/onboarding');
    }
  }
  async function deleteAccount() {
    setAccountBusy(true);
    setError(null);
    try {
      await api('/users/me', { method: 'DELETE' });
      disconnectSocket();
      queryClient.clear();
      await useApp.getState().clearSession();
      router.replace('/onboarding');
    } catch (deleteError) {
      setError(deleteError);
      setAccountBusy(false);
      setConfirmDelete(false);
    }
  }
  if (!user) return <Redirect href="/onboarding" />;
  return (
    <SafeAreaView edges={['top']} style={s.page}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { maxWidth: 600, width: '100%', alignSelf: 'center', paddingBottom: 110 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>Mon petit coin</Text>
        <GlassSurface style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
          <Avatar avatar={user.avatar} size={100} online={user.visible} />
          <Text style={s.h2}>{user.displayName}</Text>
          <Text style={s.muted}>@{user.username}</Text>
        </GlassSurface>
        <View style={s.between}>
          <View style={[s.row, { flex: 1 }]}>
            <Icon name={user.visible ? 'eye-outline' : 'eye-off-outline'} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.body}>Visible a proximite</Text>
              <Text style={s.muted}>
                {user.visible
                  ? 'Les rencontres peuvent commencer.'
                  : 'Tu explores en toute discretion.'}
              </Text>
            </View>
          </View>
          <Switch
            accessibilityLabel="Visible a proximite"
            value={user.visible}
            disabled={busy}
            trackColor={{ false: '#CCD7D2', true: colors.accent }}
            onValueChange={(visible) => void update({ visible })}
          />
        </View>
        <View style={s.divider} />
        <Field label="Ton prenom" value={name} onChangeText={setName} maxLength={40} />
        <Field
          label="Quelques mots sur toi"
          value={bio}
          onChangeText={setBio}
          maxLength={160}
          multiline
        />
        <Button
          title="Enregistrer"
          icon="checkmark"
          onPress={() => void update({ displayName: name, bio })}
          loading={busy}
        />
        <ErrorText error={error} />
        {notice !== '' && <Text style={s.muted}>{notice}</Text>}
        <View style={s.divider} />
        <Text style={s.h2}>Sécurité du compte</Text>
        <Field
          label="Mot de passe actuel (si déjà défini)"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <Field
          label="Nouveau mot de passe"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <Button
          title="Mettre à jour le mot de passe"
          secondary
          icon="lock-closed-outline"
          onPress={() => void savePassword()}
          loading={accountBusy}
        />
        <Button
          title="Déconnexion"
          secondary
          icon="log-out-outline"
          onPress={() => void signOut()}
          loading={accountBusy}
        />
        {!confirmDelete ? (
          <Button
            title="Supprimer mon compte"
            secondary
            icon="trash-outline"
            onPress={() => setConfirmDelete(true)}
          />
        ) : (
          <View style={[s.card, { borderWidth: 1, borderColor: colors.error }]}>
            <Text style={s.body}>
              Cette action supprime définitivement ton profil, tes positions et tes conversations.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirmer la suppression du compte"
              disabled={accountBusy}
              onPress={() => void deleteAccount()}
              style={({ pressed }) => [
                s.button,
                { backgroundColor: colors.error, opacity: pressed || accountBusy ? 0.7 : 1 },
              ]}
            >
              <Text style={s.buttonText}>
                {accountBusy ? 'Suppression…' : 'Confirmer la suppression'}
              </Text>
            </Pressable>
            <Button title="Annuler" secondary onPress={() => setConfirmDelete(false)} />
          </View>
        )}
        <View style={s.divider} />
        <Text style={s.h2}>A ton rythme</Text>
        <Button
          title="Activer les notifications"
          secondary
          icon="notifications-outline"
          onPress={() => {
            void registerNotifications().then(setNotice).catch(setError);
          }}
        />
        <Button
          title="Actualiser ma position"
          secondary
          icon="locate-outline"
          onPress={() => void locate()}
        />
        {DEMO && (
          <Button
            title="Explorer Bordeaux · Demo"
            secondary
            icon="map-outline"
            onPress={() => void locate(true)}
          />
        )}
        <View style={[s.row, { alignItems: 'flex-start', marginVertical: 12 }]}>
          <Icon name="shield-checkmark-outline" color={colors.accent} />
          <Text style={[s.muted, { flex: 1 }]}>
            Charte acceptee. Ta position est approximative pour les autres. Tu gardes le controle de
            ta visibilite.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
