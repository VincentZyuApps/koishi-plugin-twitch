//utils.ts
import axios, { AxiosInstance } from 'axios';
import { Context } from 'koishi';
import { TWITCH_API_BASE_URL, TWITCH_OAUTH_URL } from './types';

/**
 * 从 url 获取图片，走代理，返回 data: 开头的 base64
 */
export async function fetchImageAsDataUrl(apiClient: AxiosInstance, url: string): Promise<string> {
  const res = await apiClient.get(url, { responseType: 'arraybuffer' });

  // 尝试从 header 推断 MIME 类型（默认 image/jpeg）
  const contentType = res.headers['content-type'] || 'image/png';

  const base64 = Buffer.from(res.data, 'binary').toString('base64');
  return `data:${contentType};base64,${base64}`;
}

/**
 * 根据用户名获取 Twitch 用户头像的 Base64 编码
 * @param ctx Koishi Context
 * @param config 插件配置
 * @param apiClient Axios 实例（已配置代理）
 * @param userLogin Twitch 用户登录名
 * @returns 头像图片的 Base64 数据 URL，如果失败则返回 null
 */
export async function getProfileImageAsDataUrl(
  ctx: Context,
  config,
  apiClient: AxiosInstance,
  userLogin: string
): Promise<string | null> {
  try {
    // 1. 获取 App Access Token
    const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'client_credentials',
    });
    const accessToken = tokenResponse.data.access_token;

    // 2. 根据用户登录名获取用户信息，包括头像 URL
    const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${userLogin}`, {
      headers: {
        'Client-ID': config.clientId,
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (usersResponse.data.data.length === 0) {
      ctx.logger.warn(`未找到用户 "${userLogin}"。`);
      return null;
    }

    const profileImageUrl = usersResponse.data.data[0].profile_image_url;

    // 3. 使用已有的 fetchImageAsDataUrl 函数下载图片并转为 Base64
    const dataUrl = await fetchImageAsDataUrl(apiClient, profileImageUrl);
    ctx.logger.info(`已成功获取用户 ${userLogin} 的头像 Base64 数据。`);
    return dataUrl;

  } catch (error: any) {
    ctx.logger.error('获取用户头像失败：', error.response?.data || error.message);
    return null;
  }
}