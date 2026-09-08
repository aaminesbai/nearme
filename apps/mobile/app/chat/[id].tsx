import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import type { Conversation, Message } from '@nearme/shared';
import { api, emit, queryClient, socket } from '../../src/api';
import { useApp } from '../../src/state';
import {
  Avatar,
  Button,
  colors,
  Empty,
  ErrorText,
  Icon,
  IconButton,
  Loading,
  s,
} from '../../src/ui';

type Pending = Message & { status: 'sending' | 'failed' };
interface History {
  messages: Message[];
  nextCursor: string | null;
}
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, connected, ready } = useApp();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const list = useRef<FlatList<Message | Pending>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTyping = useRef(0);
  const autoScroll = useRef(true);
  const chats = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<Conversation[]>('/conversations'),
    enabled: !!user?.charterAccepted,
  });
  const history = useQuery({
    queryKey: ['messages', id],
    queryFn: () => api<History>(`/conversations/${id}/messages`),
    enabled: !!user?.charterAccepted,
  });
  const conversation = chats.data?.find((c) => c.id === id);
  useFocusEffect(
    useCallback(() => {
      if (!user?.charterAccepted || !connected) return;
      const live = socket;
      useApp.setState({ activeConversation: id });
      void emit<{ online: boolean }>('chat:join', { conversationId: id })
        .then((value) => setOnline(value.online))
        .catch(setError);
      void history.refetch();
      const onTyping = (event: { conversationId: string; typing: boolean }) => {
        if (event.conversationId !== id) return;
        setTyping(event.typing);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 3500);
      };
      const presence = (event: { conversationId: string; online: boolean }) => {
        if (event.conversationId === id) setOnline(event.online);
      };
      const blocked = (event: { conversationId: string }) => {
        if (event.conversationId === id) setUnavailable(true);
      };
      const message = (event: Message) => {
        if (event.conversationId === id) {
          void api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => undefined);
          setTyping(false);
        }
      };
      live?.on('typing:update', onTyping);
      live?.on('presence:update', presence);
      live?.on('chat:unavailable', blocked);
      live?.on('message:new', message);
      const app = AppState.addEventListener('change', (state) => {
        if (state !== 'active') useApp.setState({ activeConversation: null });
      });
      return () => {
        useApp.setState({ activeConversation: null });
        app.remove();
        void emit('typing:update', { conversationId: id, typing: false }).catch(() => undefined);
        void emit('chat:leave', { conversationId: id }).catch(() => undefined);
        live?.off('typing:update', onTyping);
        live?.off('presence:update', presence);
        live?.off('chat:unavailable', blocked);
        live?.off('message:new', message);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      };
    }, [id, connected, user?.charterAccepted, history.refetch]),
  );
  useEffect(() => {
    setPending((old) =>
      old.filter((p) => !history.data?.messages.some((m) => m.clientId === p.clientId)),
    );
  }, [history.data]);
  if (!ready) return <Loading />;
  if (!user?.charterAccepted) return <Redirect href="/" />;
  async function send(existing?: Pending) {
    const message: Pending = existing ?? {
      id: Crypto.randomUUID(),
      conversationId: id,
      senderId: user!.id,
      clientId: Crypto.randomUUID(),
      body: body.trim(),
      createdAt: new Date().toISOString(),
      status: 'sending',
    };
    if (!message.body || message.body.length > 2000) return;
    setError(null);
    autoScroll.current = true;
    setPending((old) => [
      ...old.filter((p) => p.clientId !== message.clientId),
      { ...message, status: 'sending' },
    ]);
    if (!existing) setBody('');
    try {
      const saved = await emit<Message>('message:send', {
        conversationId: id,
        clientId: message.clientId,
        body: message.body,
      });
      queryClient.setQueryData<History>(['messages', id], (old) => ({
        nextCursor: old?.nextCursor ?? null,
        messages: [...(old?.messages ?? []).filter((m) => m.clientId !== saved.clientId), saved],
      }));
      setPending((old) => old.filter((p) => p.clientId !== message.clientId));
      void emit('typing:update', { conversationId: id, typing: false }).catch(() => undefined);
    } catch (error) {
      setPending((old) =>
        old.map((p) => (p.clientId === message.clientId ? { ...p, status: 'failed' } : p)),
      );
      setError(error);
    }
  }
  async function older() {
    if (!history.data?.nextCursor) return;
    setLoadingOlder(true);
    autoScroll.current = false;
    try {
      const result = await api<History>(
        `/conversations/${id}/messages?before=${history.data.nextCursor}`,
      );
      queryClient.setQueryData<History>(['messages', id], (old) => ({
        messages: [...result.messages, ...(old?.messages ?? [])],
        nextCursor: result.nextCursor,
      }));
    } catch (e) {
      setError(e);
    } finally {
      setLoadingOlder(false);
    }
  }
  const messages = [
    ...(history.data?.messages ?? []),
    ...pending.filter((p) => !history.data?.messages.some((m) => m.clientId === p.clientId)),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            s.row,
            {
              padding: 16,
              backgroundColor: 'white',
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            },
          ]}
        >
          <IconButton
            name="arrow-back"
            label="Retour aux messages"
            onPress={() => router.replace('/(tabs)/chats')}
          />
          {conversation && (
            <Pressable
              style={[s.row, { flex: 1 }]}
              onPress={() => router.push(`/person/${conversation.peer.id}`)}
            >
              <Avatar avatar={conversation.peer.avatar} size={44} online={online && connected} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>
                  {conversation.peer.displayName}
                </Text>
                <Text style={s.muted}>
                  {!connected ? 'Reconnexion...' : online ? 'En ligne' : 'Hors ligne'}
                </Text>
              </View>
            </Pressable>
          )}
        </View>
        {history.isLoading ? (
          <Loading />
        ) : history.isError ? (
          <View style={s.content}>
            <ErrorText error={history.error} />
            <Button title="Reessayer" onPress={() => void history.refetch()} />
          </View>
        ) : (
          <FlatList
            ref={list}
            data={messages}
            keyExtractor={(m) => m.clientId}
            contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (autoScroll.current) list.current?.scrollToEnd({ animated: true });
            }}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              autoScroll.current =
                contentSize.height - layoutMeasurement.height - contentOffset.y < 100;
            }}
            scrollEventThrottle={100}
            ListHeaderComponent={
              history.data?.nextCursor ? (
                <Button
                  title="Messages precedents"
                  secondary
                  loading={loadingOlder}
                  onPress={() => void older()}
                />
              ) : (
                <Text style={[s.muted, { textAlign: 'center', fontSize: 11, marginBottom: 20 }]}>
                  UN BONJOUR PEUT TOUT CHANGER
                </Text>
              )
            }
            ListEmptyComponent={
              <Empty
                icon="chatbubble-outline"
                title={`Dis bonjour${conversation ? ` a ${conversation.peer.displayName}` : ''}.`}
              />
            }
            renderItem={({ item }) => {
              const mine = item.senderId === user.id;
              const status = 'status' in item ? item.status : null;
              return (
                <View
                  style={{ maxWidth: '84%', alignSelf: mine ? 'flex-end' : 'flex-start', gap: 5 }}
                >
                  <View
                    style={{
                      padding: 14,
                      backgroundColor: mine ? colors.accent : 'white',
                      borderRadius: 16,
                      ...(mine ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
                    }}
                  >
                    <Text
                      style={{ color: mine ? 'white' : colors.ink, fontSize: 16, lineHeight: 23 }}
                    >
                      {item.body}
                    </Text>
                  </View>
                  <View
                    style={[s.row, { justifyContent: mine ? 'flex-end' : 'flex-start', gap: 4 }]}
                  >
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      {new Date(item.createdAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {mine && (
                      <Icon
                        name={
                          status === 'sending'
                            ? 'time-outline'
                            : status === 'failed'
                              ? 'alert-circle-outline'
                              : 'checkmark-done'
                        }
                        size={14}
                        color={status === 'failed' ? colors.error : colors.accent}
                      />
                    )}
                  </View>
                  {status === 'failed' && (
                    <Pressable onPress={() => void send(item as Pending)}>
                      <Text style={{ color: colors.error, fontSize: 12 }}>Reessayer l'envoi</Text>
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
        )}
        <View style={{ height: 26, paddingHorizontal: 24 }}>
          <Text style={s.muted}>
            {typing && connected ? `${conversation?.peer.displayName ?? "Quelqu'un"} ecrit...` : ''}
          </Text>
        </View>
        <View style={{ paddingHorizontal: 20 }}>
          <ErrorText error={error} />
          {unavailable && (
            <Text style={{ color: colors.error }}>Cette conversation n'est plus disponible.</Text>
          )}
        </View>
        <View style={[s.row, { padding: 16, backgroundColor: 'white', alignItems: 'flex-end' }]}>
          <TextInput
            accessibilityLabel="Message"
            placeholder="Un petit bonjour..."
            placeholderTextColor={colors.muted}
            value={body}
            maxLength={2000}
            multiline
            editable={!unavailable}
            onChangeText={(value) => {
              setBody(value);
              if (Date.now() - lastTyping.current > 1200) {
                lastTyping.current = Date.now();
                void emit('typing:update', { conversationId: id, typing: value.length > 0 }).catch(
                  () => undefined,
                );
              }
            }}
            style={[s.input, { flex: 1, maxHeight: 120, paddingVertical: 14 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Envoyer le message"
            disabled={!body.trim() || !connected || unavailable || history.isError}
            onPress={() => void send()}
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !body.trim() || !connected || unavailable ? 0.4 : 1,
            }}
          >
            <Icon name="arrow-up" color="white" size={26} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
