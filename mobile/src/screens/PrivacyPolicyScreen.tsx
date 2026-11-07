import Constants from 'expo-constants';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentFrame } from '../components/layout';
import { Notice, ScreenHeader, SecondaryButton } from '../components/ui';
import { PRIVACY_CONTACT_URL, PRIVACY_POLICY_VERSION, PRIVACY_SECTIONS } from '../domain/privacy';
import { colors, radius, spacing } from '../theme/theme';

export function PrivacyPolicyScreen({ onBack }: { onBack: () => void }) {
  const policyUrl = String(Constants.expoConfig?.extra?.privacyPolicyUrl ?? '');
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Privacy Policy" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={780} style={styles.content}>
          <Text style={styles.title}>Outfit Combination Privacy Policy</Text>
          <Text style={styles.version}>Version: {PRIVACY_POLICY_VERSION}</Text>
          <Notice>This policy describes the app’s current data flows. The developer identity and contact information must match the app store listing before publication.</Notice>
          {PRIVACY_SECTIONS.map((section) => (
            <View key={section.title} style={styles.card}>
              <Text style={styles.heading}>{section.title}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}
          {policyUrl ? <SecondaryButton title="Open web policy" onPress={() => void Linking.openURL(policyUrl)} /> : null}
          <SecondaryButton title="Privacy request / support" onPress={() => void Linking.openURL(PRIVACY_CONTACT_URL)} />
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 48 },
  content: { padding: spacing.md, gap: spacing.md },
  title: { color: colors.text, fontSize: 25, fontWeight: '900' },
  version: { color: colors.muted, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  heading: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
});
