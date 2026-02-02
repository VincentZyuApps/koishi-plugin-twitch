//types.ts
// Twitch API 基础 URL
export const TWITCH_API_BASE_URL = 'https://api.twitch.tv/helix';
export const TWITCH_OAUTH_URL = 'https://id.twitch.tv/oauth2/token';

// 新增：代理协议类型
export const PROXY_PROTOCOL = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS4: 'socks4',
  SOCKS5: 'socks5',
  SOCKS5H: 'socks5h',
} as const;
export type ProxyProtocolType = typeof PROXY_PROTOCOL[keyof typeof PROXY_PROTOCOL];

export const MSG_FORM = {
  TEXT: 'text',
  PUPPETEER_IMAGE: 'puppeteer_image',
  RAW_IMAGE: 'raw_image',
  FORWARD: 'forward',
} as const;

export interface LiveInfo {
    user_name: string,
    title: string,
    started_at: string,
    game_name: string,
    viewer_count: number,
    user_login: string,
    url: string,
    profile_image_url: string,
    thumbnail_url: string,
}