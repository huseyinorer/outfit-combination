import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import { prepareBackgroundRemovalWithProgress, type ModelPreparation } from '../services/backgroundRemoval';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

const SLIDE_MS = 3_200;
const OFFER_BACKGROUND_AFTER_MS = 25_000;

type Status = 'preparing' | ModelPreparation;

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const { language } = useI18n();
  const l = (tr: string, en: string) => language === 'tr' ? tr : en;
  const { width } = useWindowDimensions();
  const slideWidth = Math.min(width, 640);
  const slides = [
    {
      icon: '📸',
      title: l('Dolabını fotoğrafla', 'Snap your wardrobe'),
      body: l('Kıyafetinin fotoğrafını çek; AI rengini, türünü ve mevsimini senin için doldursun.', 'Take a photo of a piece; AI fills in its color, type and season for you.'),
    },
    {
      icon: '✂️',
      title: l('Arka planı tek dokunuşla temizle', 'Clean the background in one tap'),
      body: l('Fotoğrafın altındaki butona bas; kıyafet arka plandan ayrılır, dolabın derli toplu görünür. Şu an bunun için gereken model hazırlanıyor.', 'Tap the button under the photo to lift the piece off its background. The model for this is being prepared right now.'),
    },
    {
      icon: '✨',
      title: l('Kombin Bul', 'Find Outfits'),
      body: l('Bugünün havasına ve gideceğin yere göre dolabındaki gerçek parçalardan kombin önerileri al.', 'Get outfit ideas from your real pieces, matched to today\'s weather and where you are going.'),
    },
    {
      icon: '📅',
      title: l('Giydiklerini takip et', 'Track what you wear'),
      body: l('"Bugün giydim" ile takvimini, istatistiklerini ve giyim başı maliyetini gör; seyahat için bavul listesi hazırla.', 'Log "Wore today" to see your calendar, stats and cost per wear, and build a packing list for trips.'),
    },
  ];

  const [status, setStatus] = useState<Status>('preparing');
  const [progress, setProgress] = useState<number | null>(null);
  const [offerBackground, setOfferBackground] = useState(false);
  const [slide, setSlide] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => active && setOfferBackground(true), OFFER_BACKGROUND_AFTER_MS);
    void prepareBackgroundRemovalWithProgress((fraction) => {
      if (active) setProgress(fraction);
    }).then((result) => {
      if (active) setStatus(result);
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (status !== 'preparing' || progress !== null) return undefined;
    const loop = Animated.loop(Animated.timing(sweep, {
      toValue: 1,
      duration: 1_200,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [progress, status, sweep]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = (slide + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: next * slideWidth, animated: true });
      setSlide(next);
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [slide, slideWidth, slides.length]);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    setSlide(Math.max(0, Math.min(index, slides.length - 1)));
  };

  const preparing = status === 'preparing';
  const percent = progress !== null ? Math.round(progress * 100) : null;
  const statusText = preparing
    ? percent !== null
      ? l(`Arka plan temizleme hazırlanıyor · %${percent}`, `Preparing background cleanup · ${percent}%`)
      : l('Arka plan temizleme hazırlanıyor…', 'Preparing background cleanup…')
    : status === 'ready'
      ? l('Her şey hazır ✓', 'All set ✓')
      : l('Uygulama hazır. Arka plan temizleme ilk kullanımda tekrar denenecek.', 'The app is ready. Background cleanup will retry when you first use it.');
  const barTrack = slideWidth - spacing.lg * 2;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>OUTFIT COMBINATION</Text>
        <Text style={styles.title}>{l('Hoş geldin', 'Welcome')}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={[styles.carousel, { width: slideWidth }]}
      >
        {slides.map((item) => (
          <View key={item.title} style={[styles.slide, { width: slideWidth }]}>
            <View style={styles.illustration}>
              <Text style={styles.illustrationIcon}>{item.icon}</Text>
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {slides.map((item, index) => (
          <View key={item.title} style={[styles.dot, index === slide && styles.dotActive]} />
        ))}
      </View>

      <View style={[styles.footer, { width: slideWidth }]}>
        <Text style={styles.status}>{statusText}</Text>
        <View style={styles.track}>
          {preparing && percent === null ? (
            <Animated.View
              style={[styles.sweep, {
                transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-barTrack * 0.4, barTrack] }) }],
              }]}
            />
          ) : (
            <View style={[styles.fill, { width: `${preparing ? percent ?? 0 : 100}%` }]} />
          )}
        </View>
        {preparing ? (
          offerBackground ? (
            <SecondaryButton title={l('Arka planda devam et', 'Continue in the background')} onPress={onDone} />
          ) : null
        ) : (
          <PrimaryButton title={l('Başla', 'Get started')} onPress={onDone} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingVertical: spacing.xl },
  header: { alignItems: 'center', gap: 4, marginBottom: spacing.lg },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900' },
  carousel: { flexGrow: 0 },
  slide: { alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  illustration: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  illustrationIcon: { fontSize: 58 },
  slideTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  slideBody: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', minHeight: 66 },
  dots: { flexDirection: 'row', gap: 8, marginTop: spacing.md, marginBottom: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.primary },
  footer: { paddingHorizontal: spacing.lg, gap: spacing.md },
  status: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 4, backgroundColor: colors.primary },
});
