module.exports = (config) => {
  const permissions = new Set(config.android?.permissions ?? []);
  permissions.add("android.permission.RECORD_AUDIO");
  config.android = { ...config.android, permissions: [...permissions] };
  return config;
};
