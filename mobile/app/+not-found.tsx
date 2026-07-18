import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SpaceColors } from '@/constants/Colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Missing' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Screen not found</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Back to Home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SpaceColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: { color: SpaceColors.text, fontSize: 20, fontWeight: '800' },
  link: { marginTop: 16 },
  linkText: { color: SpaceColors.accent, fontSize: 15, fontWeight: '700' },
});
