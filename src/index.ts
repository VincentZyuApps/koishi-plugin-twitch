// index.ts

import { Bot, Context, Logger, Session, h } from 'koishi';
import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import cron, { ScheduledTask } from 'node-cron';

import { PROXY_PROTOCOL, MSG_FORM, TWITCH_API_BASE_URL, TWITCH_OAUTH_URL, LiveInfo } from './types';
import { Config, BroadcasterConfig } from './config';
import { renderLiveImage } from './render';
import { fetchImageAsDataUrl, formatDateTime, formatToLocalTime, getProfileImageAsDataUrl } from './utils';

// 导出配置
export { Config } from './config';

export const name = 'twitch';
export const inject = {
    required: ["puppeteer", "database"]
};


export async function apply(ctx: Context, config: Config) {

    let apiClient: AxiosInstance;
    // 更改：jobs 数组现在存储一个包含 username 和 job 的对象
    const jobs: Array<{ username: string, job: ScheduledTask }> = [];

    // 🔐 Token 缓存
    let cachedToken: { token: string; expiresAt: number } | null = null;

    /**
     * 获取 Access Token（支持缓存）
     */
    async function getAccessToken(): Promise<string> {
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

    // 定义数据库模型
    ctx.model.extend('twitch_stream_status', {
        username: 'string',
        isStreaming: 'boolean',
    }, {
        primary: 'username',
    });

    let proxyAgent;
    if (config.proxy.enabled) {
        const proxyUrl = `${config.proxy.protocol}://${config.proxy.host}:${config.proxy.port}`;
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

    // 抽象出解析和发送消息的函数
    async function sendLiveNotification(
        ctx: Context,
        config,
        session: Session,
        bot: Bot,
        channelId: string,
        apiClient: AxiosInstance,
        streamData: any[],
        enableSendLink: boolean = true
    ) {
        if (streamData.length === 0) {
            return '主播当前没有在直播。';
        }

        const stream = streamData[0];

        const payload: LiveInfo = {
            user_name: stream.user_name,
            title: stream.title,
            // started_at: stream.started_at,
            started_at: formatToLocalTime(stream.started_at, config.localTimezoneOffset),
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            user_login: stream.user_login,
            url: `https://www.twitch.tv/${stream.user_login}`,
            profile_image_url: stream.profile_image_url,
            thumbnail_url: stream.thumbnail_url,
        };

        let messageElements = [];

        const profileImageBase64 = await getProfileImageAsDataUrl(ctx, config, apiClient, payload.user_login);
        const thumbnailUrl = payload.thumbnail_url.replace("{width}", "1920").replace("{height}", "1080");
        const coverImageBase64 = await fetchImageAsDataUrl(apiClient, thumbnailUrl);

        // TEXT: 纯文字
        if (config.msgFormArr.includes(MSG_FORM.TEXT)) {
            messageElements.push(
                `主播${payload.user_name}正在Twitch直播!`,
                `标题：${payload.title}`,
                `开播时间: ${payload.started_at}`,
                `游戏：${payload.game_name}`,
                `观看人数：${payload.viewer_count}`,
                ...(enableSendLink ? [`链接：${payload.url}`] : []),
            );

            if (session !== undefined) {
                await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${messageElements.join('\n')}`);
            } else {
                await bot.sendMessage(channelId, messageElements.join('\n'));
            }
        }

        // RAW_IMAGE: 直接发送头像 + 封面图
        if (config.msgFormArr.includes(MSG_FORM.RAW_IMAGE)) {
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
            } else {
                await bot.sendMessage(channelId, rawImageElements.join('\n'));
            }
        }

        // PUPPETEER_IMAGE: Puppeteer 渲染模板图
        if (config.msgFormArr.includes(MSG_FORM.PUPPETEER_IMAGE)) {
            // Fix: Added coverImageBase64 and profileImageBase64 as arguments
            const renderRes = await renderLiveImage(ctx, payload, coverImageBase64, profileImageBase64);
            if (!renderRes) return;

            const messageArr = [
                `主播${payload.user_name}正在Twitch直播!`,
                `${h.image(`data:image/png;base64,${renderRes}`)}`,
                ...(enableSendLink ? [`链接：${payload.url}`] : []),
            ]

            if (session !== undefined) {
                await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${messageArr.join('\n')}`);
            } else {
                await bot.sendMessage(channelId, messageArr.join('\n'));
            }
        }

        // FORWARD: 合并转发（仅 OneBot 平台）
        if (config.msgFormArr.includes(MSG_FORM.FORWARD)) {
            const currentBot = session?.bot || bot;
            if (currentBot?.platform === 'onebot') {
                const escapeXml = (text: string) => {
                    return text
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');
                };

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
                    } else {
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

    // 轮询检查函数
    async function checkStreamStatus() {
        ctx.logger.info(`(当前时间：${formatDateTime()})开始执行轮询任务... `);
        const broadcasters = config.subscribeList;
        if (!broadcasters || broadcasters.length === 0) {
            ctx.logger.warn('未配置任何主播，跳过轮询。');
            return;
        }

        try {
            const accessToken = await getAccessToken();

            // 🚀 批量查询模式
            if (config.enableBatchQuery) {
                ctx.logger.info(`使用批量查询模式，共 ${broadcasters.length} 个主播`);
                
                // 1. 批量获取所有主播的用户信息
                const userLogins = broadcasters.map(b => b.username);
                const usersQuery = userLogins.map(u => `login=${u}`).join('&');
                const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?${usersQuery}`, {
                    headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
                });

                // 构建 username -> userId 的映射
                const userIdMap = new Map<string, string>();
                for (const user of usersResponse.data.data) {
                    userIdMap.set(user.login.toLowerCase(), user.id);
                }

                // 2. 批量查询所有主播的直播状态
                const userIds = Array.from(userIdMap.values());
                const streamsQuery = userIds.map(id => `user_id=${id}`).join('&');
                const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?${streamsQuery}`, {
                    headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
                });

                // 构建 user_login -> streamData 的映射
                const streamMap = new Map<string, any>();
                for (const stream of streamsResponse.data.data) {
                    streamMap.set(stream.user_login.toLowerCase(), stream);
                }

                // 3. 处理每个主播的状态变化
                for (const broadcaster of broadcasters) {
                    const { username, targetPlatformChannelId } = broadcaster;
                    const logger = new Logger(`twitch-${username}`);
                    const usernameLower = username.toLowerCase();

                    if (!userIdMap.has(usernameLower)) {
                        logger.warn(`找不到主播 ${username}，跳过检查。`);
                        continue;
                    }

                    let dbStatus = await ctx.database.get('twitch_stream_status', { username });
                    let isStreaming = dbStatus[0]?.isStreaming || false;

                    const streamData = streamMap.get(usernameLower);
                    const newIsStreaming = !!streamData;

                    if (newIsStreaming && !isStreaming) {
                        logger.info(`轮询发现开播：${username}`);
                        await ctx.database.upsert('twitch_stream_status', [{ username, isStreaming: true }]);

                        for (const { platform, channelId, enableSendLink } of targetPlatformChannelId) {
                            const bot = ctx.bots.find(b => b.platform === platform);
                            if (!bot) {
                                logger.warn(`未找到平台为 "${platform}" 的机器人，跳过发送。`);
                                continue;
                            }
                            await sendLiveNotification(ctx, config, undefined, bot, channelId, apiClient, [streamData], enableSendLink ?? true);
                        }
                    } else if (!newIsStreaming && isStreaming) {
                        logger.info(`轮询发现下播：${username}`);
                        await ctx.database.upsert('twitch_stream_status', [{ username, isStreaming: false }]);

                        const messageToSend = `主播 ${username} 已下播。`;
                        for (const { platform, channelId } of targetPlatformChannelId) {
                            const bot = ctx.bots.find(b => b.platform === platform);
                            if (!bot) continue;
                            await bot.sendMessage(channelId, messageToSend);
                        }
                    }
                }
            } else {
                // 🐢 逐个查询模式（原来的逻辑）
                ctx.logger.info(`使用逐个查询模式，共 ${broadcasters.length} 个主播`);
                
                for (const broadcaster of broadcasters) {
                    const { username, targetPlatformChannelId } = broadcaster;
                    const logger = new Logger(`twitch-${username}`);

                    let dbStatus = await ctx.database.get('twitch_stream_status', { username });
                    let isStreaming = dbStatus[0]?.isStreaming || false;

                    const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${username}`, {
                        headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
                    });

                    if (!usersResponse.data.data.length) {
                        logger.warn(`找不到主播 ${username}，跳过检查。`);
                        continue;
                    }
                    const broadcasterUserId = usersResponse.data.data[0].id;

                    const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?user_id=${broadcasterUserId}`, {
                        headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
                    });

                    const streamData = streamsResponse.data.data;
                    const newIsStreaming = streamData.length > 0;

                    if (newIsStreaming && !isStreaming) {
                        logger.info(`轮询发现开播：${username}`);
                        await ctx.database.upsert('twitch_stream_status', [{ username, isStreaming: true }]);

                        for (const { platform, channelId, enableSendLink } of targetPlatformChannelId) {
                            const bot = ctx.bots.find(b => b.platform === platform);
                            if (!bot) {
                                logger.warn(`未找到平台为 "${platform}" 的机器人，跳过发送。`);
                                continue;
                            }
                            await sendLiveNotification(ctx, config, undefined, bot, channelId, apiClient, streamData, enableSendLink ?? true);
                        }
                    } else if (!newIsStreaming && isStreaming) {
                        logger.info(`轮询发现下播：${username}`);
                        await ctx.database.upsert('twitch_stream_status', [{ username, isStreaming: false }]);

                        const messageToSend = `主播 ${username} 已下播。`;
                        for (const { platform, channelId } of targetPlatformChannelId) {
                            const bot = ctx.bots.find(b => b.platform === platform);
                            if (!bot) continue;
                            await bot.sendMessage(channelId, messageToSend);
                        }
                    }
                }
            }
        } catch (error: any) {
            ctx.logger.error('轮询检查开播状态失败：', error.response?.data || error.message);
        }
    }

    // 自动推送直播信息的核心逻辑（针对单个主播）
    async function autoPushLiveinfoForBroadcaster(broadcaster: BroadcasterConfig) {
        const { username, targetPlatformChannelId } = broadcaster;
        const logger = new Logger(`twitch-${username}`);
        logger.info(`开始执行自动推送任务：${username}`);

        try {
            const accessToken = await getAccessToken();

            let dbStatus = await ctx.database.get('twitch_stream_status', { username });
            let isStreaming = dbStatus[0]?.isStreaming || false;

            if (!isStreaming) {
                logger.info(`自动推送：主播 ${username} 当前未开播，跳过推送。`);
                return;
            }

            const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${username}`, {
                headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (!usersResponse.data.data.length) {
                logger.warn(`找不到主播 ${username}，跳过自动推送。`);
                return;
            }
            const broadcasterUserId = usersResponse.data.data[0].id;

            const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?user_id=${broadcasterUserId}`, {
                headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` },
            });

            const streamData = streamsResponse.data.data;
            if (streamData.length > 0) {
                logger.info(`自动推送开播信息：${username}`);

                for (const { platform, channelId, enableSendLink } of targetPlatformChannelId) {
                    const bot = ctx.bots.find(b => b.platform === platform);
                    if (!bot) {
                        logger.warn(`未找到平台为 "${platform}" 的机器人，跳过自动推送。`);
                        continue;
                    }
                    await sendLiveNotification(ctx, config, undefined, bot, channelId, apiClient, streamData, enableSendLink ?? true);
                }
            }
        } catch (error: any) {
            logger.error('自动推送直播信息失败：', error.response?.data || error.message);
        }
    }

    ctx.on('ready', async () => {
        try {
            if (config.pollCron) {
                ctx.logger.info(`已启用轮询，Cron表达式：${config.pollCron}`);
                const pollJob = cron.schedule(config.pollCron, checkStreamStatus);
                // 更改：推入对象
                jobs.push({ username: 'general-poll', job: pollJob });
            }

            // 初始化数据库状态并创建自动推送任务
            for (const broadcaster of config.subscribeList) {
                await ctx.database.upsert('twitch_stream_status', [{ username: broadcaster.username, isStreaming: false }]);

                if (broadcaster.autoPushLiveinfoEnabled) {
                    const cronExp = `*/${broadcaster.autoPushLiveinfoIntervalMinute} * * * *`;
                    const logger = new Logger(`twitch-${broadcaster.username}`);
                    logger.info(`已启用自动推送直播信息，主播: ${broadcaster.username}，时间间隔: ${broadcaster.autoPushLiveinfoIntervalMinute} 分钟`);
                    // 为每个主播创建独立的定时任务，只推送该主播的信息
                    const autoPushJob = cron.schedule(cronExp, () => autoPushLiveinfoForBroadcaster(broadcaster));
                    // 更改：推入对象
                    jobs.push({ username: broadcaster.username, job: autoPushJob });
                }
            }

        } catch (err) {
            ctx.logger.error('插件启动失败:', err);
        }
    });

    ctx.on('dispose', () => {
        // 更改：遍历对象数组
        for (const { username, job } of jobs) {
            job.stop();
            const logger = new Logger(`twitch-${username}`)
            logger.info(`(当前时间: ${formatDateTime()})定时任务已停止。主播名: ${username} `);
        }
    });

    // atc 指令，支持动态查询
    ctx.command('tw.check [username:string]', '检查主播开播状态, 传入主播名参数。比如这个直播间：https://www.twitch.tv/nacho_dayo，那么就输入`atc nacho_dayo`')
        .alias('检查twitch开播')
        .alias('atc')
        .alias('awa_twitch_check')
        .action(async ({ session }, username) => {
            let targetUsername = username;

            if (!targetUsername) {
                if (config.subscribeList && config.subscribeList.length > 0) {
                    targetUsername = config.subscribeList[0].username;
                } else {
                    targetUsername = 'vincentzyu';
                }
            }

            const logger = new Logger(`twitch-${targetUsername}`);
            logger.info(`检查主播开播状态：${targetUsername}`);

            try {
                const accessToken = await getAccessToken();

                const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${targetUsername}`, {
                    headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
                });
                if (!usersResponse.data.data.length) {
                    return `找不到主播 ${targetUsername}。`;
                }
                const broadcasterUserId = usersResponse.data.data[0].id;

                const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?user_id=${broadcasterUserId}`, {
                    headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` },
                });

                const streamData = streamsResponse.data.data;
                // logger.info(`streamData = ${JSON.stringify(streamData)}`)

                if (streamData.length === 0) {
                    return '主播当前没有在直播。';
                }

                await sendLiveNotification(ctx, config, session, undefined, undefined, apiClient, streamData);

                return;
            } catch (error: any) {
                logger.error('检查开播状态失败：', error.response?.data || error.message);
                return '检查开播状态时发生错误，请检查日志。';
            }
        });
}