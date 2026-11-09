const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withInfoPlist,
} = require('@expo/config-plugins');

const light = {
  background: '#F7F3EA', surface: '#FFFCF6', surface_muted: '#EEE9DF', figure: '#D8D1C5',
  text: '#211F1B', muted: '#746F65', primary: '#264D3B', on_primary: '#FFFFFF',
  primary_soft: '#DDE9E0', accent: '#B36B3D', border: '#DED8CC', danger: '#A13A32',
  danger_soft: '#F8E2DF', warning_soft: '#F4E5D4', success_border: '#BFD2C5',
  warning_border: '#D8C3A8', developer_surface: '#F8F1DF', developer_border: '#C9B789',
  snackbar: '#25231F', snackbar_text: '#FFFFFF', snackbar_action: '#CFE8D7', white: '#FFFFFF',
};

const dark = {
  background: '#111512', surface: '#1A201C', surface_muted: '#242B26', figure: '#3C463F',
  text: '#F3EFE7', muted: '#B9B2A7', primary: '#78B491', on_primary: '#102219',
  primary_soft: '#23382C', accent: '#E3A270', border: '#39423B', danger: '#F08C83',
  danger_soft: '#402522', warning_soft: '#392E22', success_border: '#416650',
  warning_border: '#70583D', developer_surface: '#302B20', developer_border: '#77663F',
  snackbar: '#E7E1D7', snackbar_text: '#171914', snackbar_action: '#24563C', white: '#FFFFFF',
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
