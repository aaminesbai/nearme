import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Redirect } from 'expo-router';
import { loginSchema, registerSchema, type User } from '@nearme/shared';
import { api } from '../src/api';
import { useApp } from '../src/state';
import { Avatar, Button, colors, ErrorText, Field, GlassSurface, Icon, s } from '../src/ui';

type Mode = 'choice' | 'login' | 'register';

export default function Onboarding() {
  const user = useApp((state) => state.user);
  const [mode, setMode] = useState<Mode>('choice');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (user) return <Redirect href={user.charterAccepted ? '/(tabs)' : '/charter'} />;

  async function submit() {
    setError(null);
    if (mode === 'register' && password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    const parsed =
      mode === 'login'
        ? loginSchema.safeParse({ username, password })
        : registerSchema.safeParse({ displayName: name, username, password, avatar, bio: '' });
    if (!parsed.success) {
      setError(
        mode === 'login'
          ? 'Saisis ton pseudo et ton mot de passe.'
          : 'Prénom : 2 caractères minimum. Pseudo : 3 à 24 lettres, chiffres ou _. Mot de passe : 8 caractères minimum.',
      );
      return;
    }
    setLoading(true);
    try {
      const result = await api<{ user: User; token: string }>(
        mode === 'login' ? '/auth/login' : '/auth/register',
        { method: 'POST', body: parsed.data },
      );
      await useApp.getState().session(result.token, result.user);
      router.replace(result.user.charterAccepted ? '/(tabs)' : '/charter');
    } catch (submitError) {
      setError(submitError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.content,
            { flexGrow: 1, maxWidth: 520, width: '100%', alignSelf: 'center' },
          ]}
        >
          <View style={s.between}>
            <View style={s.row}>
              <Icon name="navigate-circle" size={34} color={colors.accent} />
              <Text style={s.h2}>NearMe</Text>
            </View>
            <Text style={s.label}>BONJOUR, TOI.</Text>
          </View>
          <View style={{ alignItems: 'center', paddingVertical: 20, gap: 12 }}>
            <View style={s.row}>
              <Avatar avatar={2} size={58} />
              <Avatar avatar={0} size={94} />
              <Avatar avatar={1} size={58} />
            </View>
            <Text style={[s.title, { textAlign: 'center', marginTop: 12 }]}>
              Les belles rencontres{'\n'}commencent tout près.
            </Text>
            <Text style={[s.muted, { textAlign: 'center' }]}>
              Un visage, un bonjour, une nouvelle histoire.
            </Text>
          </View>

          <GlassSurface style={{ marginTop: 12, padding: 22, borderRadius: 28 }}>
            {mode === 'choice' ? (
              <View style={{ gap: 14 }}>
                <Text style={s.h2}>On fait connaissance ?</Text>
                <Text style={s.muted}>Connecte-toi ou crée ton espace en quelques secondes.</Text>
                <Button
                  title="Se connecter"
                  icon="log-in-outline"
                  onPress={() => setMode('login')}
                />
                <Button
                  title="Créer un compte"
                  secondary
                  icon="person-add-outline"
                  onPress={() => setMode('register')}
                />
                <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>
                  Un compte par pseudo, sans adresse e-mail.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 18 }}>
                <Text style={s.h2}>
                  {mode === 'login' ? 'Content de te revoir.' : 'Créer ton compte'}
                </Text>
                {mode === 'register' && (
                  <Field
                    label="Ton prénom"
                    placeholder="Comment t'appelles-tu ?"
                    value={name}
                    onChangeText={setName}
                    maxLength={40}
                    autoComplete="given-name"
                  />
                )}
                <Field
                  label="Ton pseudo"
                  placeholder="ex. camille_bdx"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={24}
                />
                <Field
                  label="Mot de passe"
                  placeholder="8 caractères minimum"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={128}
                  returnKeyType="done"
                  onSubmitEditing={() => void submit()}
                />
                {mode === 'register' && (
                  <Field
                    label="Confirmer le mot de passe"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={128}
                    returnKeyType="done"
                    onSubmitEditing={() => void submit()}
                  />
                )}
                {mode === 'register' && (
                  <>
                    <Text style={s.muted}>Choisis ton portrait</Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((value) => (
                        <Pressable
                          key={value}
                          accessibilityRole="button"
                          accessibilityLabel={`Portrait ${value + 1}`}
                          accessibilityState={{ selected: avatar === value }}
                          onPress={() => setAvatar(value)}
                          style={{
                            padding: 3,
                            borderRadius: 40,
                            borderWidth: 2,
                            borderColor: avatar === value ? colors.accent : 'transparent',
                          }}
                        >
                          <Avatar avatar={value} size={42} />
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                <ErrorText error={error} />
                <Button
                  title={mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                  icon="arrow-forward"
                  onPress={() => void submit()}
                  loading={loading}
                />
                <Button
                  title={mode === 'login' ? 'Créer un compte' : 'J’ai déjà un compte'}
                  secondary
                  onPress={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError(null);
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setMode('choice');
                    setError(null);
                  }}
                >
                  <Text style={[s.muted, { textAlign: 'center' }]}>Retour</Text>
                </Pressable>
              </View>
            )}
          </GlassSurface>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
