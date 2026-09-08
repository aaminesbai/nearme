import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { avatarUrls } from '@nearme/shared';
export const colors = {
  bg: '#F5F7F7',
  surface: '#FFFFFF',
  ink: '#193A37',
  muted: '#718480',
  accent: '#087F70',
  mint: '#DFF3EA',
  coral: '#F18470',
  line: '#E4EBE8',
  error: '#B3443C',
};
export const tokens = {
  spacing: [4, 8, 12, 16, 20, 24, 32, 40],
  radius: { card: 8, button: 8, avatar: 999 },
  typography: { title: 30, heading: 22, body: 16, label: 13 },
};
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: 0 },
  h2: { fontSize: 22, fontWeight: '700', color: colors.ink },
  body: { fontSize: 16, lineHeight: 24, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  label: { fontSize: 12, fontWeight: '700', color: colors.accent, letterSpacing: 0 },
  card: { backgroundColor: colors.surface, borderRadius: 8, padding: 18, gap: 12 },
  input: {
    minHeight: 54,
    backgroundColor: '#EDF2F0',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: colors.ink,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    minHeight: 54,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: colors.line },
});
export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({
  name,
  size = 22,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: ComponentProps<typeof Ionicons>['color'];
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Avatar({
  avatar,
  size = 56,
  online = false,
}: {
  avatar: number;
  size?: number;
  online?: boolean;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={{ uri: avatarUrls[avatar] }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.mint }}
      />
      {online && (
        <View
          style={{
            position: 'absolute',
            right: 1,
            bottom: 1,
            width: 13,
            height: 13,
            borderRadius: 8,
            backgroundColor: colors.accent,
            borderWidth: 3,
            borderColor: 'white',
          }}
        />
      )}
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled,
  loading,
  icon,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        secondary && { backgroundColor: colors.mint },
        { opacity: disabled || loading ? 0.4 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="white" />
      ) : (
        icon && <Icon name={icon} color={secondary ? colors.accent : 'white'} />
      )}
      <Text style={[s.buttonText, secondary && { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={s.iconButton}
    >
      <Icon name={name} />
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={s.input}
        {...props}
      />
    </View>
  );
}
export function Empty({
  icon = 'people-outline',
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 16 }}>
      <Icon name={icon} size={36} color={colors.accent} />
      <Text style={[s.h2, { textAlign: 'center' }]}>{title}</Text>
      {children}
    </View>
  );
}
export function ErrorText({ error }: { error: unknown }) {
  return error ? (
    <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 14, lineHeight: 20 }}>
      {error instanceof Error ? error.message : String(error)}
    </Text>
  ) : null;
}
export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}
