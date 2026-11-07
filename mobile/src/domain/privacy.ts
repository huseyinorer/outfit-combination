export const AI_CONSENT_VERSION = '2026-11-07-v2';
export const PRIVACY_POLICY_VERSION = '2026-11-07';
export const PRIVACY_CONTACT_URL = 'https://github.com/huseyinorer/outfit-combination/issues';

export const AI_DISCLOSURE =
  'AI ile kıyafet analizi istediğinde seçtiğin küçültülmüş fotoğraf backend sunucusuna ve yurt dışında hizmet verebilen OpenAI API’ye gönderilir. AI kombin önerisinde fotoğraf veya dosya yolu gönderilmez; yalnızca seçimlerin ve kıyafetlerin yazılı özellikleri gönderilir. Kalıcı kıyafet fotoğrafı telefonunda tutulur. Onayını Ayarlar’dan geri çekebilirsin.';

export const PRIVACY_SECTIONS = [
  {
    title: 'Data controller and contact',
    body: 'Outfit Combination is developed by Hüseyin Örer. You can use the project support link for privacy requests. The developer identity and contact method must match the information shown in the app store listing before publication.',
  },
  {
    title: 'Data stored on your device',
    body: 'Clothing photos, clothing attributes, drafts, favorite outfits, learned AI corrections, and app settings are stored in the app’s private local storage. If Google account access is enabled and you sign in, a time-limited Outfit Combination session token and basic account display information are also stored in the private app area. Local data remains until you delete it, clear app data, or uninstall the app.',
  },
  {
    title: 'Optional account data',
    body: 'When account access is enabled and you choose Google sign-in, Google shares a stable account identifier, verified email address, display name, and optional profile-picture URL with the backend. Neon stores those fields, login timestamps, and AI usage counters so usage rights belong to the account rather than one app installation. Google passwords and Google access or refresh tokens are not stored.',
  },
  {
    title: 'Data processed when AI is enabled',
    body: 'After you provide explicit consent, a reduced-size clothing photo is sent to the backend hosted on Render and to the OpenAI API for clothing analysis. Outfit requests contain only your preferences, random clothing identifiers, and textual clothing attributes. They do not contain photos, local file paths, image URLs, or base64 image data.',
  },
  {
    title: 'Purposes and legal basis',
    body: 'Data is processed only to authenticate an optional account, assign AI usage rights, identify clothing attributes, generate outfit suggestions, prevent abuse, control service costs, and maintain service security. AI processing is based on your explicit consent. Manual clothing entry and the local outfit engine remain available without consent or an account.',
  },
  {
    title: 'Retention',
    body: 'The backend does not permanently store your wardrobe or clothing photos in its database. OpenAI requests use store=false. According to OpenAI’s official API data controls, API content is not used to train models by default, while abuse-monitoring logs may be retained for up to 30 days. Account profile data remains until you delete the account or request deletion. Pseudonymous AI usage records may remain separated from the deleted profile for abuse and cost control and are deleted when they are older than 13 months.',
  },
  {
    title: 'Service providers and international transfers',
    body: 'Google provides optional account authentication, Render provides backend hosting, Neon provides the account and usage database, and OpenAI provides image and text analysis. Their infrastructure may process data outside Türkiye. Provider secrets and the OpenAI API key are stored only in the backend environment and are never embedded in the mobile app.',
  },
  {
    title: 'Deletion and your rights',
    body: 'You can delete clothing records, photos, favorites, drafts, learned corrections, and settings from this device by selecting “Tüm yerel verilerimi sil” in Settings. If signed in, “Hesabımı kalıcı olarak sil” removes the Google identifier, email, display name, picture URL, and server-side profile without deleting the local wardrobe. Pseudonymous usage counters may be retained for up to 13 months to prevent quota-reset abuse. AI consent can be withdrawn from the same screen. Other privacy requests can be submitted through the support link.',
  },
] as const;
