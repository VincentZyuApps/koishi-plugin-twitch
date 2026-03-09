// renderAll.ts - tw.all 命令的渲染逻辑

import { Context, Session, h } from 'koishi';
import { AxiosInstance } from 'axios';
import { } from 'koishi-plugin-puppeteer';

import { MSG_FORM } from './types';
import { Config, BroadcasterConfig } from './config';
import { 
    formatDateTime, escapeXml, getCtx, getCustomFontCSS, 
    fetchImageAsDataUrl, getProfileImageAsDataUrl 
} from './utils';

// ==================== 🎨 主播列表 HTML 模板 ====================

interface BroadcasterStatusItem {
    username: string;
    displayName: string;
    isLive: boolean;
    gameName?: string;
    title?: string;
    viewerCount?: number;
    thumbnailUrl?: string;
    profileImageBase64?: string;
}

function getAllStatusTemplateStr(items: BroadcasterStatusItem[], liveCount: number, offlineCount: number): string {
    const { fontFaceCSS, fontFamily } = getCustomFontCSS();
    
    const broadcasterItems = items.map((item, index) => {
        const statusClass = item.isLive ? 'live' : 'offline';
        const statusText = item.isLive ? '直播中' : '未直播';
        
        return `
            <div class="broadcaster-item ${statusClass}">
                <div class="item-left">
                    <span class="index">#${(index + 1).toString().padStart(2, '0')}</span>
                    <div class="status-indicator"></div>
                    <div class="avatar">
                        ${item.profileImageBase64 
                            ? `<img src="${item.profileImageBase64}" alt="头像" />`
                            : `<div class="avatar-placeholder">?</div>`
                        }
                    </div>
                    <div class="basic-info">
                        <div class="username">${item.displayName || item.username}</div>
                        <div class="status-text">${statusText}</div>
                    </div>
                </div>
                ${item.isLive ? `
                    <div class="item-middle">
                        <div class="game-name">🎮 ${item.gameName || '未知游戏'}</div>
                        <div class="title" title="${item.title || ''}">${item.title || '无标题'}</div>
                        <div class="viewers">👀 ${item.viewerCount?.toLocaleString() || 0} 人观看</div>
                    </div>
                    <div class="item-right">
                        ${item.thumbnailUrl 
                            ? `<img class="thumbnail" src="${item.thumbnailUrl}" alt="封面" />`
                            : `<div class="thumbnail-placeholder">无封面</div>`
                        }
                    </div>
                ` : `
                    <div class="item-middle offline-msg">
                        <span>当前未开播</span>
                    </div>
                    <div class="item-right">
                        <div class="thumbnail-placeholder offline">离线</div>
                    </div>
                `}
            </div>
        `;
    }).join('');

    return `
    <html>
    <head>
        <meta charset="utf-8" />
        <style>
            ${fontFaceCSS}
            
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: ${fontFamily};
                background: linear-gradient(135deg, #0e0e10 0%, #18181b 50%, #1f1f23 100%);
                min-height: 100vh;
                padding: 24px;
                width: 900px;
            }
            
            .container {
                width: 100%;
            }
            
            .header {
                text-align: center;
                margin-bottom: 20px;
                padding: 20px 24px;
                background: linear-gradient(135deg, rgba(145, 71, 255, 0.2), rgba(145, 71, 255, 0.05));
                border-radius: 16px;
                border: 1px solid rgba(145, 71, 255, 0.3);
            }
            
            .header h1 {
                color: #fff;
                font-size: 1.4em;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            
            .twitch-icon {
                width: 24px;
                height: 24px;
            }
            
            .stats {
                display: flex;
                justify-content: center;
                gap: 32px;
            }
            
            .stat-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 1em;
            }
            
            .stat-dot {
                width: 12px;
                height: 12px;
                border-radius: 50%;
            }
            
            .stat-dot.live {
                background: #00c853;
                box-shadow: 0 0 8px #00c853;
            }
            
            .stat-dot.offline {
                background: #666;
            }
            
            .stat-label {
                color: #aaa;
            }
            
            .stat-num {
                color: #fff;
                font-weight: bold;
                font-size: 1.1em;
            }
            
            .broadcaster-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .broadcaster-item {
                background: rgba(40, 40, 45, 0.9);
                border-radius: 12px;
                padding: 14px 18px;
                display: flex;
                align-items: center;
                border: 1px solid rgba(255, 255, 255, 0.08);
                transition: all 0.2s ease;
            }
            
            .broadcaster-item.live {
                border-color: rgba(0, 200, 83, 0.3);
                background: linear-gradient(90deg, rgba(0, 200, 83, 0.08), rgba(40, 40, 45, 0.9));
            }
            
            .broadcaster-item.offline {
                opacity: 0.7;
            }
            
            .item-left {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 240px;
            }
            
            .index {
                color: #9147ff;
                font-weight: bold;
                font-size: 0.9em;
                min-width: 28px;
            }
            
            .status-indicator {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                flex-shrink: 0;
            }
            
            .live .status-indicator {
                background: #00c853;
                box-shadow: 0 0 8px #00c853;
                animation: pulse 2s infinite;
            }
            
            .offline .status-indicator {
                background: #666;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .avatar {
                width: 48px;
                height: 48px;
                flex-shrink: 0;
            }
            
            .avatar img {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                border: 2px solid rgba(145, 71, 255, 0.5);
            }
            
            .avatar-placeholder {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: #333;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #666;
                font-size: 1.2em;
            }
            
            .basic-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            
            .username {
                color: #fff;
                font-weight: 600;
                font-size: 1em;
            }
            
            .status-text {
                font-size: 0.8em;
            }
            
            .live .status-text {
                color: #00c853;
            }
            
            .offline .status-text {
                color: #666;
            }
            
            .item-middle {
                flex: 1;
                padding: 0 16px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0;
            }
            
            .game-name {
                color: #9147ff;
                font-size: 0.85em;
                font-weight: 500;
            }
            
            .title {
                color: #ddd;
                font-size: 0.9em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 380px;
            }
            
            .viewers {
                color: #aaa;
                font-size: 0.8em;
            }
            
            .offline-msg {
                color: #666;
                font-style: italic;
                justify-content: center;
                align-items: center;
            }
            
            .item-right {
                flex-shrink: 0;
            }
            
            .thumbnail {
                width: 120px;
                height: 68px;
                border-radius: 6px;
                object-fit: cover;
            }
            
            .thumbnail-placeholder {
                width: 120px;
                height: 68px;
                border-radius: 6px;
                background: rgba(60, 60, 65, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #555;
                font-size: 0.8em;
            }
            
            .thumbnail-placeholder.offline {
                background: rgba(40, 40, 45, 0.5);
                color: #444;
            }
            
            .footer {
                text-align: center;
                margin-top: 16px;
                color: #555;
                font-size: 0.75em;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>
                    <svg class="twitch-icon" viewBox="0 0 24 24" fill="#9147ff">
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                    </svg>
                    Twitch 主播状态总览
                </h1>
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-dot live"></div>
                        <span class="stat-label">直播中</span>
                        <span class="stat-num">${liveCount}</span>
                    </div>
                    <div class="stat-item">
                        <div class="stat-dot offline"></div>
                        <span class="stat-label">未直播</span>
                        <span class="stat-num">${offlineCount}</span>
                    </div>
                </div>
            </div>
            
            <div class="broadcaster-list">
                ${broadcasterItems}
            </div>
            
            <div class="footer">
                生成时间: ${formatDateTime()}
            </div>
        </div>
    </body>
    </html>
    `;
}

// ==================== 🖼️ Puppeteer 渲染函数 ====================

async function renderAllStatusImage(
    ctx: Context,
    config: Config,
    apiClient: AxiosInstance,
    broadcasters: BroadcasterConfig[],
    streamMap: Map<string, any>
): Promise<string | null> {
    if (!ctx.puppeteer) {
        ctx.logger.error("Puppeteer service is not available.");
        return null;
    }

    // 准备数据
    const items: BroadcasterStatusItem[] = [];
    
    for (const b of broadcasters) {
        const stream = streamMap.get(b.username.toLowerCase());
        const profileImageBase64 = await getProfileImageAsDataUrl(ctx, config, apiClient, b.username);
        
        if (stream) {
            // 获取缩略图
            const thumbnailUrl = stream.thumbnail_url?.replace("{width}", "320").replace("{height}", "180");
            const thumbnailBase64 = thumbnailUrl ? await fetchImageAsDataUrl(apiClient, thumbnailUrl) : null;
            
            items.push({
                username: b.username,
                displayName: stream.user_name,
                isLive: true,
                gameName: stream.game_name,
                title: stream.title,
                viewerCount: stream.viewer_count,
                thumbnailUrl: thumbnailBase64,
                profileImageBase64
            });
        } else {
            items.push({
                username: b.username,
                displayName: b.username,
                isLive: false,
                profileImageBase64
            });
        }
    }

    // 按直播状态排序：直播中的在前
    items.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0));

    const liveCount = items.filter(i => i.isLive).length;
    const offlineCount = items.length - liveCount;

    const page = await ctx.puppeteer.page();

    try {
        const html = getAllStatusTemplateStr(items, liveCount, offlineCount);

        // 动态高度
        const baseHeight = 180;
        const perItemHeight = 90;
        const estimatedHeight = baseHeight + items.length * perItemHeight;

        await page.setViewport({ width: 950, height: Math.min(estimatedHeight, 3000) });

        await page.setContent(html, {
            waitUntil: ['domcontentloaded', 'networkidle0']
        });

        // 等待列表渲染
        await page.waitForSelector('.broadcaster-list');

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
        ctx.logger.error('Error rendering all status image:', err);
        return null;
    } finally {
        await page.close();
    }
}

// ==================== 📤 渲染所有主播状态 ====================

/**
 * 渲染所有主播状态
 */
export async function renderAllStatus(
    config: Config,
    session: Session | undefined,
    apiClient: AxiosInstance,
    broadcasters: BroadcasterConfig[],
    streamMap: Map<string, any>
) {
    const ctx = getCtx();
    const msgFormArr = config.allStatusMsgFormArr;

    // 统计
    const liveCount = streamMap.size;
    const offlineCount = broadcasters.length - liveCount;

    // TEXT: 纯文字输出
    if (msgFormArr.includes(MSG_FORM.TEXT)) {
        let textMsg = `📺 **Twitch 主播状态** (${formatDateTime()})\n`;
        textMsg += `🟢 直播中: ${liveCount} | ⚫ 未直播: ${offlineCount}\n`;
        textMsg += `${'─'.repeat(30)}\n`;

        for (const b of broadcasters) {
            const stream = streamMap.get(b.username.toLowerCase());
            if (stream) {
                textMsg += `\n🟢 **${stream.user_name}** 直播中!\n`;
                textMsg += `   🎮 ${stream.game_name}\n`;
                textMsg += `   📝 ${stream.title}\n`;
                textMsg += `   👀 ${stream.viewer_count} 人观看\n`;
            } else {
                textMsg += `\n⚫ **${b.username}** 未直播\n`;
            }
        }

        if (session) {
            await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${textMsg}`);
        }
    }

    // PUPPETEER_IMAGE: 渲染主播状态列表图片
    if (msgFormArr.includes(MSG_FORM.PUPPETEER_IMAGE)) {
        const renderRes = await renderAllStatusImage(ctx, config, apiClient, broadcasters, streamMap);
        if (renderRes) {
            const imageMsg = h.image(`data:image/png;base64,${renderRes}`);
            if (session) {
                await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${imageMsg}`);
            }
        } else {
            ctx.logger.warn('tw.all 的 PUPPETEER_IMAGE 渲染失败');
        }
    }

    // FORWARD: 合并转发
    if (msgFormArr.includes(MSG_FORM.FORWARD)) {
        if (session?.bot?.platform === 'onebot') {
            let forwardContent = '<message forward>';
            forwardContent += `<message>📺 Twitch 主播状态 (${formatDateTime()})\n🟢 直播中: ${liveCount} | ⚫ 未直播: ${offlineCount}</message>`;

            for (const b of broadcasters) {
                const stream = streamMap.get(b.username.toLowerCase());
                if (stream) {
                    let msg = `🟢 ${escapeXml(stream.user_name)} 直播中!\n`;
                    msg += `🎮 ${escapeXml(stream.game_name)}\n`;
                    msg += `📝 ${escapeXml(stream.title)}\n`;
                    msg += `👀 ${stream.viewer_count} 人观看\n`;
                    msg += `🔗 https://www.twitch.tv/${escapeXml(stream.user_login)}`;
                    forwardContent += `<message>${msg}</message>`;
                } else {
                    forwardContent += `<message>⚫ ${escapeXml(b.username)} 未直播</message>`;
                }
            }

            forwardContent += '</message>';
            await session.send(forwardContent);
        } else {
            ctx.logger.warn('合并转发仅支持 OneBot 平台');
        }
    }
}
