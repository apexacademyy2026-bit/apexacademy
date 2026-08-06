import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.apexacademy.app', // hoặc Bundle ID của bạn
  appName: 'Apex Academy',
  webDir: 'dist',
  // BỎ HOẶC XÓA ĐOẠN server: { url: ... } Ở ĐÂY
  plugins: {
    StatusBar: {
      overlaysWebView: false
    }
  }
};

export default config;