// renderConfig.ts - tw.config 命令的渲染逻辑

import { Context, Session, h } from 'koishi';
import { } from 'koishi-plugin-puppeteer';

import { MSG_FORM } from './types';
import { Config, BroadcasterConfig } from './config';
import { escapeXml, getCtx, getCustomFontCSS, formatDateTime } from './utils';

// ==================== 🎨 配置卡片 HTML 模板 ====================

function getConfigTemplateStr(broadcasters: BroadcasterConfig[]): string {
    const { fontFaceCSS, fontFamily } = getCustomFontCSS();
    const activeCount = broadcasters.filter(b => b.autoPushLiveinfoEnabled).length;
    const inactiveCount = broadcasters.length - activeCount;

    const broadcasterItems = broadcasters.map((b, i) => {
        const statusClass = b.autoPushLiveinfoEnabled ? 'active' : 'inactive';
        const statusText = b.autoPushLiveinfoEnabled ? '推送中' : '未启用';
        const intervalText = b.autoPushLiveinfoEnabled ? `${b.autoPushLiveinfoIntervalMinute} 分钟` : '-';
        const channelCount = b.targetPlatformChannelId.length;
        
        return `
            <div class="broadcaster-item ${statusClass}">
                <div class="item-left">
                    <span class="index">#${(i + 1).toString().padStart(2, '0')}</span>
                    <div class="status-indicator"></div>
                    <div class="basic-info">
                        <div class="username">${b.username}</div>
                        <div class="status-text">${statusText}</div>
                    </div>
                </div>
                <div class="item-middle">
                    <div class="info-item">
                        <span class="info-icon">🔗</span>
                        <span class="info-text">twitch.tv/${b.username}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">⏱️</span>
                        <span class="info-text">${intervalText}</span>
                    </div>
                </div>
                <div class="item-right">
                    <div class="channel-badge">
                        <span class="channel-icon">📍</span>
                        <span class="channel-count">${channelCount}</span>
                        <span class="channel-label">频道</span>
                    </div>
                </div>
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
            
            .stat-dot.active {
                background: #00c853;
                box-shadow: 0 0 8px #00c853;
            }
            
            .stat-dot.inactive {
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
            }
            
            .broadcaster-item.active {
                border-color: rgba(0, 200, 83, 0.3);
                background: linear-gradient(90deg, rgba(0, 200, 83, 0.08), rgba(40, 40, 45, 0.9));
            }
            
            .broadcaster-item.inactive {
                opacity: 0.7;
            }
            
            .item-left {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 200px;
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
            
            .active .status-indicator {
                background: #00c853;
                box-shadow: 0 0 8px #00c853;
                animation: pulse 2s infinite;
            }
            
            .inactive .status-indicator {
                background: #666;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
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
            
            .active .status-text {
                color: #00c853;
            }
            
            .inactive .status-text {
                color: #666;
            }
            
            .item-middle {
                flex: 1;
                padding: 0 20px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            
            .info-item {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .info-icon {
                font-size: 0.85em;
                opacity: 0.8;
            }
            
            .info-text {
                color: #aaa;
                font-size: 0.85em;
            }
            
            .active .info-text {
                color: #bbb;
            }
            
            .item-right {
                flex-shrink: 0;
            }
            
            .channel-badge {
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(145, 71, 255, 0.15);
                padding: 8px 14px;
                border-radius: 8px;
                border: 1px solid rgba(145, 71, 255, 0.3);
            }
            
            .channel-icon {
                font-size: 0.9em;
            }
            
            .channel-count {
                color: #9147ff;
                font-weight: bold;
                font-size: 1.1em;
            }
            
            .channel-label {
                color: #888;
                font-size: 0.8em;
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
                    Twitch 订阅配置
                </h1>
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-dot active"></div>
                        <span class="stat-label">推送中</span>
                        <span class="stat-num">${activeCount}</span>
                    </div>
                    <div class="stat-item">
                        <div class="stat-dot inactive"></div>
                        <span class="stat-label">未启用</span>
                        <span class="stat-num">${inactiveCount}</span>
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

async function renderConfigImage(ctx: Context, broadcasters: BroadcasterConfig[]): Promise<string | null> {
    if (!ctx.puppeteer) {
        ctx.logger.error("Puppeteer service is not available.");
        return null;
    }

    const page = await ctx.puppeteer.page();

    try {
        const html = getConfigTemplateStr(broadcasters);

        // 根据主播数量动态调整高度
        const baseHeight = 180;
        const perBroadcasterHeight = 75;
        const estimatedHeight = baseHeight + broadcasters.length * perBroadcasterHeight;
        
        await page.setViewport({ width: 950, height: Math.min(estimatedHeight, 2000) });

        await page.setContent(html, {
            waitUntil: ['domcontentloaded']
        });

        // 等待渲染完成
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
        ctx.logger.error('Error rendering config image:', err);
        return null;
    } finally {
        await page.close();
    }
}

/**
 * 渲染配置信息
 */
export async function renderConfigInfo(
    config: Config,
    session: Session | undefined,
    broadcasters: BroadcasterConfig[]
) {
    const ctx = getCtx();
    const msgFormArr = config.configPrintMsgFormArr;

    // TEXT: 纯文字输出
    if (msgFormArr.includes(MSG_FORM.TEXT)) {
        let textMsg = `📋 **Twitch 订阅配置** (共 ${broadcasters.length} 位主播)\n`;
        textMsg += `${'─'.repeat(30)}\n`;

        for (let i = 0; i < broadcasters.length; i++) {
            const b = broadcasters[i];
            const statusEmoji = b.autoPushLiveinfoEnabled ? '🟢' : '⚫';
            textMsg += `\n${i + 1}. ${statusEmoji} **${b.username}**\n`;
            textMsg += `   🔗 https://www.twitch.tv/${b.username}\n`;
            textMsg += `   🔔 自动推送: ${b.autoPushLiveinfoEnabled ? '开启' : '关闭'}`;
            if (b.autoPushLiveinfoEnabled) {
                textMsg += ` (每 ${b.autoPushLiveinfoIntervalMinute} 分钟)\n`;
            } else {
                textMsg += '\n';
            }
            textMsg += `   📍 推送目标: ${b.targetPlatformChannelId.length} 个频道\n`;
            for (const target of b.targetPlatformChannelId) {
                textMsg += `      • ${target.platform}:${target.channelId}${target.enableSendLink ? ' 📎' : ''}\n`;
            }
        }

        if (session) {
            await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${textMsg}`);
        }
    }

    // PUPPETEER_IMAGE: Puppeteer 渲染配置卡片
    if (msgFormArr.includes(MSG_FORM.PUPPETEER_IMAGE)) {
        const renderRes = await renderConfigImage(ctx, broadcasters);
        if (renderRes) {
            const imageMsg = h.image(`data:image/png;base64,${renderRes}`);
            if (session) {
                await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${imageMsg}`);
            }
        } else {
            ctx.logger.warn('tw.config 的 PUPPETEER_IMAGE 渲染失败');
        }
    }

    // FORWARD: 合并转发
    if (msgFormArr.includes(MSG_FORM.FORWARD)) {
        if (session?.bot?.platform === 'onebot') {
            let forwardContent = '<message forward>';
            forwardContent += `<message>📋 Twitch 订阅配置 (共 ${broadcasters.length} 位主播)</message>`;

            for (let i = 0; i < broadcasters.length; i++) {
                const b = broadcasters[i];
                const statusEmoji = b.autoPushLiveinfoEnabled ? '🟢' : '⚫';
                let msg = `${i + 1}. ${statusEmoji} ${escapeXml(b.username)}\n`;
                msg += `🔗 https://www.twitch.tv/${escapeXml(b.username)}\n`;
                msg += `🔔 自动推送: ${b.autoPushLiveinfoEnabled ? '开启' : '关闭'}`;
                if (b.autoPushLiveinfoEnabled) msg += ` (每 ${b.autoPushLiveinfoIntervalMinute} 分钟)`;
                msg += `\n📍 推送到 ${b.targetPlatformChannelId.length} 个频道`;
                forwardContent += `<message>${msg}</message>`;
            }

            forwardContent += '</message>';
            await session.send(forwardContent);
        } else {
            ctx.logger.warn('合并转发仅支持 OneBot 平台');
        }
    }
}
