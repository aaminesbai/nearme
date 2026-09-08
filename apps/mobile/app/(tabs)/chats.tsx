import { useCallback } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { Conversation } from '@nearme/shared';
import { api } from '../../src/api';
import { Avatar, Button, colors, Empty, ErrorText, Loading, s } from '../../src/ui';
export default function Chats() {
  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<Conversation[]>('/conversations'),
  });
  useFocusEffect(
    useCallback(() => {
      void query.refetch();
    }, [query.refetch]),
  );
  return (
    <SafeAreaView edges={['top']} style={s.page}>
      <View style={s.content}>
        <Text style={s.label}>LES LIENS SE CREENT ICI</Text>
        <Text style={s.title}>
          Messages<Text style={{ color: colors.coral }}>.</Text>
        </Text>
      </View>
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <View style={s.content}>
          <ErrorText error={query.error} />
          <Button title="Reessayer" onPress={() => void query.refetch()} />
        </View>
      ) : (
        <FlatList
          data={query.data}
          keyExtractor={(item) => item.id}
          onRefresh={() => void query.refetch()}
          refreshing={query.isRefetching}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: 24,
            maxWidth: 720,
            width: '100%',
            alignSelf: 'center',
          }}
          ListEmptyComponent={
            <Empty icon="chatbubbles-outline" title="Tout commence par un bonjour.">
              <Text style={[s.muted, { textAlign: 'center' }]}>
                Tes conversations apparaitront ici.
              </Text>
              <Button
                title="Decouvrir les personnes proches"
                onPress={() => router.navigate('/(tabs)/nearby')}
              />
            </Empty>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/chat/${item.id}`)}
              style={[
                s.row,
                { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
              ]}
            >
              <Avatar avatar={item.peer.avatar} size={60} online={item.online} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={s.between}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
                    {item.peer.displayName}
                  </Text>
                  <Text style={[s.muted, { fontSize: 11 }]}>
                    {new Date(item.updatedAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[s.muted, item.unread > 0 && { color: colors.ink, fontWeight: '600' }]}
                >
                  {item.lastMessage ?? 'Dis-lui bonjour !'}
                </Text>
              </View>
              {item.unread > 0 && (
                <View
                  style={{
                    backgroundColor: colors.accent,
                    padding: 6,
                    minWidth: 24,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ color: 'white', textAlign: 'center', fontSize: 11 }}>
                    {item.unread}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
