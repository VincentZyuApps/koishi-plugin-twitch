// renderCheck.ts - tw.check 命令的渲染逻辑 + Puppeteer 模板

import { Context, Bot, Session, h } from 'koishi';
import { AxiosInstance } from 'axios';
import { } from 'koishi-plugin-puppeteer';

import { MSG_FORM, LiveInfo } from './types';
import { Config } from './config';
import { 
    fetchImageAsDataUrl, formatToLocalTime, getProfileImageAsDataUrl,
    escapeXml, getCustomFontCSS 
} from './utils';

// ==================== 🎨 Puppeteer HTML 模板 ====================

const getTemplateStr = (
    liveInfoPayload: LiveInfo,
    coverImageUrl: string,
    profileImageUrl: string
): string => {
    const { fontFaceCSS, fontFamily } = getCustomFontCSS();
    
    return `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${fontFaceCSS}
        
        body {
          margin: 0;
          padding: 0;
          font-family: ${fontFamily};
          background: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }

        .background-container {
          position: fixed;
          top: 0; left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 1;
        }

        .background-cover {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: blur(30px) brightness(0.5);
          transform: scale(1.05);
        }

        .main-container {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          height: 100vh;
          padding: 32px;
          box-sizing: border-box;
        }

        .card {
          width: 90%;
          max-width: 800px;
          border-radius: 24px;
          overflow: hidden;
          background: rgba(30, 30, 40, 0.6);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
        }

        .cover-container {
          position: relative;
          width: 100%;
          padding-bottom: 56.25%; /* 16:9 */
          background-color: #1a1a1f;
        }

        .cover {
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .info {
          padding: 24px 28px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          color: #fff;
        }

        .user {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 2px solid #9147ff;
          object-fit: cover;
        }

        .username {
          font-size: 1.4em;
          font-weight: bold;
        }

        .game {
          font-size: 1em;
          color: #cfcfcf;
        }

        .title {
          font-size: 1.2em;
          font-weight: 600;
          color: #fff;
        }

        .time, .viewers {
          font-size: 0.95em;
          color: #bdbdbd;
        }

        .link {
          margin-top: 10px;
          font-size: 0.95em;
          color: #9147ff;
          text-decoration: none;
          font-weight: 600;
          display: flex;
          align-items: center;
        }
        
        .link::before {
            content: '▶';
            margin-right: 5px;
        }

        .link:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="background-container">
        <img class="background-cover" id="background-cover" src="${profileImageUrl}" alt="背景封面"/>
      </div>
      <div class="main-container">
        <div class="card">
          <div class="cover-container">
            <img class="cover" id="cover-image" src="${coverImageUrl}" alt="直播封面"/>
          </div>
          <div class="info">
            <div class="user">
              <img class="avatar" id="avatar-image" src="${profileImageUrl}" alt="头像"/>
              <span class="username">${liveInfoPayload.user_name}</span>
            </div>
            <div class="game">${liveInfoPayload.game_name}</div>
            <div class="title">${liveInfoPayload.title}</div>
            <div class="time">开播时间：${liveInfoPayload.started_at.replace('T', ' ').replace('Z', '')}</div>
            <div class="viewers">观看人数：${liveInfoPayload.viewer_count}</div>
            <a class="link" href="${liveInfoPayload.url}">前往直播间</a>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
};

// ==================== 🖼️ Puppeteer 渲染函数 ====================

/**
 * 渲染 Twitch 直播卡片图片（磨砂玻璃+圆角风格）
 */
async function renderLiveImage(
    ctx: Context, 
    liveInfoPayload: LiveInfo, 
    coverImageUrl: string, 
    profileImageUrl: string
): Promise<string | null> {
    if (!ctx.puppeteer) {
        ctx.logger.error("Puppeteer service is not available.");
        return null;
    }

    const page = await ctx.puppeteer.page();

    try {
        const html = getTemplateStr(liveInfoPayload, coverImageUrl, profileImageUrl);

        await page.setViewport({ width: 1000, height: 800 });

        await page.setContent(html, {
            waitUntil: ['domcontentloaded']
        });

        // 等待所有图片加载完成
        await page.waitForFunction(() => {
            const avatar = document.getElementById('avatar-image') as HTMLImageElement;
            const cover = document.getElementById('cover-image') as HTMLImageElement;
            const backgroundCover = document.getElementById('background-cover') as HTMLImageElement;
            return avatar.complete && cover.complete && backgroundCover.complete;
        }, { timeout: 15000 });

        // 获取 body 尺寸并截图
        const bodyHandle = await page.$('body');
        const boundingBox = await bodyHandle.boundingBox();
        if (boundingBox) {
            const screenshot = await page.screenshot({
                type: 'png',
                encoding: 'base64',
                clip: {
                    x: boundingBox.x,
                    y: boundingBox.y,
                    width: boundingBox.width,
                    height: boundingBox.height,
                },
            });
            return screenshot as string;
        } else {
            ctx.logger.error('Could not get bounding box for body.');
            return null;
        }

    } catch (err) {
        ctx.logger.error('Error rendering Twitch stream image:', err);
        return null;
    } finally {
        await page.close();
    }
}

// ==================== 📤 发送开播通知 ====================

/**
 * 发送开播通知（支持多种消息格式）
 */
export async function sendLiveNotification(
    ctx: Context,
    config: Config,
    session: Session | undefined,
    bot: Bot | undefined,
    channelId: string | undefined,
    apiClient: AxiosInstance,
    streamData: any[],
    enableSendLink: boolean = true,
    msgFormArr: string[] = config.liveCheckMsgFormArr
) {
    if (streamData.length === 0) {
        return '主播当前没有在直播。';
    }

    const stream = streamData[0];

    const payload: LiveInfo = {
        user_name: stream.user_name,
        title: stream.title,
        started_at: formatToLocalTime(stream.started_at, config.localTimezoneOffset),
        game_name: stream.game_name,
        viewer_count: stream.viewer_count,
        user_login: stream.user_login,
        url: `https://www.twitch.tv/${stream.user_login}`,
        profile_image_url: stream.profile_image_url,
        thumbnail_url: stream.thumbnail_url,
    };

    const profileImageBase64 = await getProfileImageAsDataUrl(ctx, config, apiClient, payload.user_login);
    const thumbnailUrl = payload.thumbnail_url.replace("{width}", "1920").replace("{height}", "1080");
    const coverImageBase64 = await fetchImageAsDataUrl(apiClient, thumbnailUrl);

    // TEXT: 纯文字
    if (msgFormArr.includes(MSG_FORM.TEXT)) {
        const messageElements = [
            `主播${payload.user_name}正在Twitch直播!`,
            `标题：${payload.title}`,
            `开播时间: ${payload.started_at}`,
            `游戏：${payload.game_name}`,
            `观看人数：${payload.viewer_count}`,
            ...(enableSendLink ? [`链接：${payload.url}`] : []),
        ];

        if (session !== undefined) {
            await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${messageElements.join('\n')}`);
        } else if (bot && channelId) {
            await bot.sendMessage(channelId, messageElements.join('\n'));
        }
    }

    // RAW_IMAGE: 直接发送头像 + 封面图
    if (msgFormArr.includes(MSG_FORM.RAW_IMAGE)) {
        const rawImageElements = [
            `主播${payload.user_name}正在Twitch直播!`,
            ...(profileImageBase64 ? [h.image(profileImageBase64)] : []),
            `开播时间: ${payload.started_at}`,
            `游戏：${payload.game_name}`,
            `观看人数：${payload.viewer_count}`,
            ...(enableSendLink ? [`链接：${payload.url}`] : []),
            ...(coverImageBase64 ? [h.image(coverImageBase64)] : []),
        ];

        if (session !== undefined) {
            await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${rawImageElements.join('\n')}`);
        } else if (bot && channelId) {
            await bot.sendMessage(channelId, rawImageElements.join('\n'));
        }
    }

    // PUPPETEER_IMAGE: Puppeteer 渲染模板图
    if (msgFormArr.includes(MSG_FORM.PUPPETEER_IMAGE)) {
        const renderRes = await renderLiveImage(ctx, payload, coverImageBase64, profileImageBase64);
        if (!renderRes) return;

        const messageArr = [
            `主播${payload.user_name}正在Twitch直播!`,
            `${h.image(`data:image/png;base64,${renderRes}`)}`,
            ...(enableSendLink ? [`链接：${payload.url}`] : []),
        ];

        if (session !== undefined) {
            await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${messageArr.join('\n')}`);
        } else if (bot && channelId) {
            await bot.sendMessage(channelId, messageArr.join('\n'));
        }
    }

    // FORWARD: 合并转发（仅 OneBot 平台）
    if (msgFormArr.includes(MSG_FORM.FORWARD)) {
        const currentBot = session?.bot || bot;
        if (currentBot?.platform === 'onebot') {
            let forwardContent = '<message forward>';

            // 标题消息
            forwardContent += `<message>📺 Twitch 直播通知\n🎮 主播 ${escapeXml(payload.user_name)} 正在直播!</message>`;

            // 头像消息
            if (profileImageBase64) {
                forwardContent += `<message><img src="${escapeXml(profileImageBase64)}"/></message>`;
            }

            // 直播信息
            forwardContent += `<message>📝 标题: ${escapeXml(payload.title)}</message>`;
            forwardContent += `<message>🕐 开播时间: ${escapeXml(payload.started_at)}</message>`;
            forwardContent += `<message>🎮 游戏: ${escapeXml(payload.game_name)}</message>`;
            forwardContent += `<message>👀 观看人数: ${payload.viewer_count}</message>`;

            // 封面图
            if (coverImageBase64) {
                forwardContent += `<message><img src="${escapeXml(coverImageBase64)}"/></message>`;
            }

            // 链接
            if (enableSendLink) {
                forwardContent += `<message>🔗 链接: ${escapeXml(payload.url)}</message>`;
            }

            forwardContent += '</message>';

            try {
                if (session !== undefined) {
                    await session.send(forwardContent);
                } else if (bot && channelId) {
                    await bot.sendMessage(channelId, forwardContent);
                }
            } catch (err) {
                ctx.logger.warn(`合并转发发送失败，可能平台不支持:`, err);
            }
        } else {
            ctx.logger.warn(`合并转发仅支持 OneBot 平台，当前平台: ${currentBot?.platform}`);
        }
    }
}
