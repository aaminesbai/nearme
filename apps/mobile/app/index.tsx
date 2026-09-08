import { Redirect } from 'expo-router';
import { useApp } from '../src/state';
import { Loading } from '../src/ui';
export default function Index() {
  const { ready, user } = useApp();
  if (!ready) return <Loading />;
  return <Redirect href={!user ? '/onboarding' : !user.charterAccepted ? '/charter' : '/(tabs)'} />;
}
