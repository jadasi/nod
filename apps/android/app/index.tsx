import { Redirect } from 'expo-router';
import { useAppStore } from '@/state.js';

/** Routes to the sign-in screen or the inbox, depending on the session. */
export default function Index() {
  const session = useAppStore((s) => s.session);
  return <Redirect href={session ? '/(tabs)/inbox' : '/sign-in'} />;
}
