const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withInfoPlist,
} = require('@expo/config-plugins');

const light = {
  background: '#F6F3ED', surface: '#FFFFFF', surface_muted: '#EDEAE2', figure: '#E0DCCF',
  text: '#1F2122', muted: '#656963', primary: '#2A2D2F', on_primary: '#F6F3ED',
  primary_soft: '#E4E2DA', accent: '#6E8571', border: '#DED9CD', danger: '#955041',
  danger_soft: '#F4DDD6', warning_soft: '#F3E6CE', success_border: '#B7C8B5',
  warning_border: '#DCC89C', developer_surface: '#ECE8D9', developer_border: '#BFB89C',
  snackbar: '#1F2122', snackbar_text: '#F6F3ED', snackbar_action: '#92A999',
  image_action_surface: '#FFFFFF', image_action_text: '#1F2122', white: '#FFFFFF',
};

const dark = {
  background: '#111214', surface: '#1A1C1D', surface_muted: '#22252A', figure: '#232627',
  text: '#ECE8DE', muted: '#9DA19A', primary: '#D3D1C6', on_primary: '#111214',
  primary_soft: '#2C2E2E', accent: '#92A999', border: '#292C2D', danger: '#E29184',
  danger_soft: '#3A2420', warning_soft: '#322A1C', success_border: '#3F524A',
  warning_border: '#5F5236', developer_surface: '#1F2224', developer_border: '#3D4341',
  snackbar: '#1A1C1D', snackbar_text: '#ECE8DE', snackbar_action: '#92A999',
  image_action_surface: '#111214', image_action_text: '#ECE8DE', white: '#FFFFFF',
};

function addPalette(modResults, palette) {
  return Object.entries(palette).reduce(
    (xml, [name, value]) => AndroidConfig.Colors.assignColorValue(xml, {
      name: `outfit_${name}`,
      value,
    }),
    modResults,
  );
}

module.exports = function withOutfitTheme(config) {
  config = withInfoPlist(config, (next) => {
    next.modResults.UIUserInterfaceStyle = 'Automatic';
    return next;
  });
  config = withAndroidColors(config, (next) => {
    next.modResults = addPalette(next.modResults, light);
    next.modResults = AndroidConfig.Colors.assignColorValue(next.modResults, {
      name: 'splashscreen_background',
      value: light.background,
    });
    return next;
  });
  return withAndroidColorsNight(config, (next) => {
    next.modResults = addPalette(next.modResults, dark);
    next.modResults = AndroidConfig.Colors.assignColorValue(next.modResults, {
      name: 'splashscreen_background',
      value: dark.background,
    });
    next.modResults = AndroidConfig.Colors.assignColorValue(next.modResults, {
      name: 'iconBackground',
      value: dark.background,
    });
    return next;
  });
};
