// Static bundled vegetable photos, keyed by lowercased name_en.
//
// React Native requires STATIC require() paths (no dynamic strings), so each
// photo must be listed explicitly here. To add real photos:
//   1. Drop a clean ~400px square webp/png (30–60 KB) into assets/veg/,
//      named like the key below (e.g. assets/veg/tomato.png).
//   2. Uncomment / add the matching require() line.
//
// Until a veg has a bundled photo, <VegImage> falls back to photo_url
// (Cloudinary, set in Admin) and then to the emoji — so the app works now and
// upgrades automatically as photos are added. This fixes the duplicate-emoji
// problem (🥒 = cucumber + ridge gourd + bitter gourd, 🌿 = okra + snake gourd
// + fenugreek + drumstick) for non-reading users.

export const VEG_IMAGES = {
  // tomato:        require('../../assets/veg/tomato.png'),
  // onion:         require('../../assets/veg/onion.png'),
  // potato:        require('../../assets/veg/potato.png'),
  // brinjal:       require('../../assets/veg/brinjal.png'),
  // okra:          require('../../assets/veg/okra.png'),
  // 'bitter gourd':require('../../assets/veg/bitter-gourd.png'),
  // 'ridge gourd': require('../../assets/veg/ridge-gourd.png'),
  // 'bottle gourd':require('../../assets/veg/bottle-gourd.png'),
  // 'snake gourd':  require('../../assets/veg/snake-gourd.png'),
  // cucumber:       require('../../assets/veg/cucumber.png'),
  // 'green chilli': require('../../assets/veg/green-chilli.png'),
  // capsicum:       require('../../assets/veg/capsicum.png'),
  // carrot:         require('../../assets/veg/carrot.png'),
  // cauliflower:    require('../../assets/veg/cauliflower.png'),
  // cabbage:        require('../../assets/veg/cabbage.png'),
  // spinach:        require('../../assets/veg/spinach.png'),
  // 'fenugreek leaves': require('../../assets/veg/fenugreek.png'),
  // drumstick:      require('../../assets/veg/drumstick.png'),
  // 'raw banana':   require('../../assets/veg/raw-banana.png'),
  // 'cluster beans':require('../../assets/veg/cluster-beans.png'),
};

export function vegImageSource(nameEn) {
  if (!nameEn) return null;
  return VEG_IMAGES[nameEn.toLowerCase().trim()] || null;
}
