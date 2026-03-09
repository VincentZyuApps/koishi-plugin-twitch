//utils.ts - 工具函数和共享状态
import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import { Context, Logger } from 'koishi';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { PROXY_PROTOCOL, TWITCH_API_BASE_URL, TWITCH_OAUTH_URL } from './types';
import { Config } from './config';

// ==================== 🔧 共享状态 ====================

let apiClient: AxiosInstance;
let cachedToken: { token: string; expiresAt: number } | null = null;
let configRef: Config;
let ctxRef: Context;

// ==================== 🔧 初始化函数 ====================

export function initShared(ctx: Context, config: Config) {
    ctxRef = ctx;
    configRef = config;

    // 初始化 apiClient
    if (config.proxy.enabled) {
        const proxyUrl = `${config.proxy.protocol}://${config.proxy.host}:${config.proxy.port}`;
        let proxyAgent;

        switch (config.proxy.protocol) {
            case PROXY_PROTOCOL.HTTP:
            case PROXY_PROTOCOL.HTTPS:
                proxyAgent = new HttpsProxyAgent(proxyUrl);
                break;
            case PROXY_PROTOCOL.SOCKS4:
            case PROXY_PROTOCOL.SOCKS5:
            case PROXY_PROTOCOL.SOCKS5H:
                proxyAgent = new SocksProxyAgent(proxyUrl);
                break;
        }

        apiClient = axios.create({
            httpsAgent: proxyAgent
        });
        ctx.logger.info(`已启用代理 (${config.proxy.protocol})：${config.proxy.host}:${config.proxy.port}`);
    } else {
        apiClient = axios.create();
        ctx.logger.info('未启用代理。');
    }
}

// ==================== 🔧 Getter 函数 ====================

export function getApiClient(): AxiosInstance {
    return apiClient;
}

export function getConfig(): Config {
    return configRef;
}

export function getCtx(): Context {
    return ctxRef;
}

// ==================== 🔐 Token 缓存 ====================

export async function getAccessToken(): Promise<string> {
    const config = configRef;
    const ctx = ctxRef;
    const now = Date.now();

    // 如果启用缓存且缓存有效，直接返回
    if (config.enableTokenCache && cachedToken && cachedToken.expiresAt > now + 60000) {
        ctx.logger.debug('使用缓存的 Access Token');
        return cachedToken.token;
    }

    // 请求新 token
    ctx.logger.info('正在获取新的 Access Token...');
    const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'client_credentials',
    });

    const token = tokenResponse.data.access_token;

    // 缓存 token
    if (config.enableTokenCache) {
        const cacheMs = config.tokenCacheMinutes * 60 * 1000;
        cachedToken = {
            token,
            expiresAt: now + cacheMs
        };
        ctx.logger.info(`Access Token 已缓存，有效期 ${config.tokenCacheMinutes} 分钟`);
    }

    return token;
}

// ==================== 🔧 XML 转义工具 ====================

export function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==================== 🔤 自定义字体 CSS 生成 ====================

/**
 * 生成自定义字体的 CSS @font-face 和 font-family
 * @returns { fontFaceCSS, fontFamily } 
 *   - fontFaceCSS: 需要插入 <style> 的 @font-face 声明
 *   - fontFamily: 用于 CSS font-family 的值
 */
export function getCustomFontCSS(): { fontFaceCSS: string; fontFamily: string } {
    const config = configRef;
    const ctx = ctxRef;
    const defaultFontFamily = "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";

    if (!config?.customFontPath || config.customFontPath.trim() === '') {
        return { fontFaceCSS: '', fontFamily: defaultFontFamily };
    }

    const fontPath = config.customFontPath.trim();

    // 检查文件是否存在
    try {
        if (!fs.existsSync(fontPath)) {
            ctx?.logger?.warn(`自定义字体文件不存在: ${fontPath}，使用默认字体`);
            return { fontFaceCSS: '', fontFamily: defaultFontFamily };
        }

        // 读取字体文件并转为 base64
        const fontBuffer = fs.readFileSync(fontPath);
        const fontBase64 = fontBuffer.toString('base64');

        // 根据扩展名判断字体格式
        const ext = path.extname(fontPath).toLowerCase();
        let fontFormat = 'truetype';
        let mimeType = 'font/ttf';
        
        switch (ext) {
            case '.ttf':
                fontFormat = 'truetype';
                mimeType = 'font/ttf';
                break;
            case '.otf':
                fontFormat = 'opentype';
                mimeType = 'font/otf';
                break;
            case '.woff':
                fontFormat = 'woff';
                mimeType = 'font/woff';
                break;
            case '.woff2':
                fontFormat = 'woff2';
                mimeType = 'font/woff2';
                break;
            default:
                ctx?.logger?.warn(`不支持的字体格式: ${ext}，使用默认字体`);
                return { fontFaceCSS: '', fontFamily: defaultFontFamily };
        }

        const fontFaceCSS = `
            @font-face {
                font-family: 'TwitchCustomFont';
                src: url('data:${mimeType};base64,${fontBase64}') format('${fontFormat}');
                font-weight: normal;
                font-style: normal;
            }
        `;

        const fontFamily = "'TwitchCustomFont', " + defaultFontFamily;

        ctx?.logger?.info(`已加载自定义字体: ${fontPath}`);
        return { fontFaceCSS, fontFamily };

    } catch (err) {
        ctx?.logger?.error(`加载自定义字体失败: ${err.message}，使用默认字体`);
        return { fontFaceCSS: '', fontFamily: defaultFontFamily };
    }
}

// ==================== 🖼️ 图片工具 ====================

/**
 * 从 url 获取图片，走代理，返回 data: 开头的 base64
 */
export async function fetchImageAsDataUrl(client: AxiosInstance, url: string): Promise<string> {
  const res = await client.get(url, { responseType: 'arraybuffer' });

  // 尝试从 header 推断 MIME 类型（默认 image/jpeg）
  const contentType = res.headers['content-type'] || 'image/png';

  const base64 = Buffer.from(res.data, 'binary').toString('base64');
  return `data:${contentType};base64,${base64}`;
}

/**
 * 根据用户名获取 Twitch 用户头像的 Base64 编码
 * @param ctx Koishi Context
 * @param config 插件配置
 * @param client Axios 实例（已配置代理）
 * @param userLogin Twitch 用户登录名
 * @returns 头像图片的 Base64 数据 URL，如果失败则返回 null
 */
export async function getProfileImageAsDataUrl(
  ctx: Context,
  config,
  client: AxiosInstance,
  userLogin: string
): Promise<string | null> {
  try {
    // 1. 获取 App Access Token（使用缓存）
    const accessToken = await getAccessToken();

    // 2. 根据用户登录名获取用户信息，包括头像 URL
    const usersResponse = await client.get(`${TWITCH_API_BASE_URL}/users?login=${userLogin}`, {
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
    const dataUrl = await fetchImageAsDataUrl(client, profileImageUrl);
    ctx.logger.debug(`已成功获取用户 ${userLogin} 的头像 Base64 数据。`);
    return dataUrl;

  } catch (error: any) {
    ctx.logger.error('获取用户头像失败：', error.response?.data || error.message);
    return null;
  }
}

// ==================== ⏰ 时间工具 ====================

/**
 * 将UTC时间字符串（如2025-08-29T05:18:35Z）转换为指定时区的时间字符串
 * @param utcTime 原始UTC时间字符串
 * @param timezoneOffset 时区偏移（如+8，表示GMT+8）
 * @returns 格式化后的本地时间字符串
 */
export function formatToLocalTime(utcTime: string, timezoneOffset: number): string {
    const date = new Date(utcTime);
    const utcTimestamp = date.getTime();
    const localTimezoneOffset = new Date().getTimezoneOffset() * 60 * 1000;
    const targetTimezoneOffset = timezoneOffset * 60 * 60 * 1000;
    const local = new Date(utcTimestamp + localTimezoneOffset + targetTimezoneOffset);

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${local.getFullYear()}年${pad(local.getMonth() + 1)}月${pad(local.getDate())}日 - ${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`;
}

/**
 * 将时间格式化为 YYYY-MM-DD - HH:MM:SS
 */
export function formatDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} - ${hours}:${minutes}:${seconds}`;
}