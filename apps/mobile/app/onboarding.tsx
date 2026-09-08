import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Redirect } from 'expo-router';
import { profileSchema, type User } from '@nearme/shared';
import { api } from '../src/api';
import { useApp } from '../src/state';
import { Avatar, Button, colors, ErrorText, Field, Icon, s } from '../src/ui';

export default function Onboarding() {
  const user = useApp((state) => state.user);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (user) return <Redirect href={user.charterAccepted ? '/(tabs)' : '/charter'} />;
  async function submit() {
    const parsed = profileSchema.safeParse({ displayName: name, username, avatar, bio: '' });
    if (!parsed.success) {
      setError('Prenom : 2 caracteres minimum. Pseudo : 3 a 24 lettres, chiffres ou _.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ user: User; token: string }>('/users', {
        method: 'POST',
        body: parsed.data,
      });
      await useApp.getState().session(result.token, result.user);
      router.replace('/charter');
    } catch (error) {
      setError(error);
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
              Les belles rencontres{'\n'}commencent tout pres.
            </Text>
            <Text style={[s.muted, { textAlign: 'center' }]}>
              Un visage, un bonjour, une nouvelle histoire.
            </Text>
          </View>
          <View style={{ gap: 18 }}>
            <Field
              label="Ton prenom"
              placeholder="Comment t'appelles-tu ?"
              value={name}
              onChangeText={setName}
              maxLength={40}
              autoComplete="given-name"
            />
            <Field
              label="Ton pseudo"
              placeholder="ex. camille_bdx"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
            />
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
          </View>
          <ErrorText error={error} />
          <Button
            title="Faire connaissance"
            icon="arrow-forward"
            onPress={() => void submit()}
            loading={loading}
          />
          <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>
            Ta session est liee a cet appareil. Aucun mot de passe requis.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
