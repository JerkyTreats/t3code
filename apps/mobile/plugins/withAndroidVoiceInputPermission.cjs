const { withAndroidManifest } = require("expo/config-plugins");

const RECORD_AUDIO_PERMISSION = "android.permission.RECORD_AUDIO";

module.exports = (config) => {
  const permissions = new Set(config.android?.permissions ?? []);
  permissions.add(RECORD_AUDIO_PERMISSION);
  config.android = { ...config.android, permissions: [...permissions] };

  return withAndroidManifest(config, (nextConfig) => {
    const manifest = nextConfig.modResults.manifest;
    const permissions = manifest["uses-permission"] ?? [];
    manifest["uses-permission"] = [
      ...permissions.filter(
        (permission) => permission.$?.["android:name"] !== RECORD_AUDIO_PERMISSION,
      ),
      { $: { "android:name": RECORD_AUDIO_PERMISSION } },
    ];
    return nextConfig;
  });
};
