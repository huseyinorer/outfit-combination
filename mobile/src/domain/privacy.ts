export const AI_CONSENT_VERSION = '2026-11-07-v2';
export const PRIVACY_POLICY_VERSION = '2026-11-07';
export const PRIVACY_CONTACT_URL = 'https://github.com/huseyinorer/outfit-combination/issues';

export const AI_DISCLOSURE =
  'Gerçek AI modunda kıyafet analizi için seçtiğin küçültülmüş fotoğraf backend sunucusuna ve yurt dışında hizmet verebilen OpenAI API’ye gönderilir. Kombin önerisinde fotoğraf veya dosya yolu gönderilmez; yalnızca seçimlerin ve kıyafetlerin yazılı özellikleri gönderilir. Kalıcı kıyafet fotoğrafı telefonunda tutulur. Onayını Ayarlar’dan geri çekebilirsin.';

export const PRIVACY_SECTIONS = [
  {
    title: 'Data controller and contact',
    body: 'Outfit Combination is developed by Hüseyin Örer. You can use the project support link for privacy requests. The developer identity and contact method must match the information shown in the app store listing before publication.',
  },
  {
    title: 'Data stored on your device',
    body: 'Clothing photos, clothing attributes, drafts, favorite outfits, learned AI corrections, and app settings are stored in the app’s private local storage. No user account is created. This data remains on the device until you delete it, clear the app data, or uninstall the app.',
  },
  {
    title: 'Data processed when AI is enabled',
    body: 'After you provide explicit consent, a reduced-size clothing photo is sent to the backend hosted on Render and to the OpenAI API for clothing analysis. Outfit requests contain only your preferences, random clothing identifiers, and textual clothing attributes. They do not contain photos, local file paths, image URLs, or base64 image data.',
  },
  {
    title: 'Purposes and legal basis',
    body: 'Data is processed only to identify clothing attributes, generate outfit suggestions, prevent abuse, control service costs, and maintain service security. AI processing is based on your explicit consent. Demo mode, manual clothing entry, and the local outfit engine remain available without consent.',
  },
  {
    title: 'Retention',
    body: 'The backend does not permanently store your wardrobe or clothing photos in its database. OpenAI requests use store=false. According to OpenAI’s official API data controls, API content is not used to train models by default, while abuse-monitoring logs may be retained for up to 30 days. A pseudonymous installation identifier and daily or monthly AI usage counters are retained for cost and abuse control and are deleted when they are older than 13 months.',
  },
  {
    title: 'Service providers and international transfers',
    body: 'Render provides backend hosting, Neon provides the usage-quota database, and OpenAI provides image and text analysis. Their infrastructure may process data outside Türkiye. The OpenAI API key is stored only in the backend environment and is never embedded in the mobile app.',
  },
  {
    title: 'Deletion and your rights',
    body: 'You can delete clothing records, photos, favorites, drafts, learned corrections, and settings from this device by selecting “Tüm yerel verilerimi sil” in Settings. AI consent can be withdrawn from the same screen. Requests for access, correction, deletion, or other privacy rights can be submitted through the support link.',
  },
] as const;
