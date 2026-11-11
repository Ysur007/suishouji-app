import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 移动端壳。
 *
 * 页面从 app 包内的 dist 加载（https://localhost），接口指向线上服务器——
 * 地址由构建时的 VITE_API_BASE 注入到 index.html 的 meta 里，
 * 也可以在应用内改成自己部署的地址（localStorage 里的 ssj:endpoint 优先）。
 */
const config: CapacitorConfig = {
  appId: 'cn.pursuer.suishouji',
  appName: '随手记',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#F2F2F2',
  },
  ios: {
    contentInset: 'always',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
};

export default config;
