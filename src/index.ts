// index.ts - 插件主入口

import { Context, Logger } from 'koishi';
import cron, { ScheduledTask } from 'node-cron';

import { TWITCH_API_BASE_URL } from './types';
import { Config, BroadcasterConfig } from './config';
import { formatDateTime } from './utils';

// 共享模块
import { initShared, getAccessToken, getApiClient } from './utils';
import { sendLiveNotification } from './renderCheck';

// 命令模块
import { registerCheckCommand } from './commandCheck';
import { registerConfigCommand } from './commandConfig';
import { registerAllCommand } from './commandAll';

// 导出配置
export { Config } from './config';

export const name = 'twitch';
export const inject = {
    required: ["puppeteer", "database"]
};

export async function apply(ctx: Context, config: Config) {
    // 初始化共享模块（apiClient、token 缓存等）
    initShared(ctx, config);

    const apiClient = getApiClient();
    const jobs: Array<{ username: string, job: ScheduledTask }> = [];

    // ==================== 📦 数据库模型 ====================
    
    ctx.model.extend('twitch_stream_status', {
        username: 'string',
        isStreaming: 'boolean',
    }, {
        primary: 'username',
    });

    // ==================== 🔄 轮询检查函数 ====================

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
                // 🐢 逐个查询模式
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

    // ==================== 📤 自动推送函数 ====================

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

    // ==================== 🚀 生命周期钩子 ====================

    ctx.on('ready', async () => {
        try {
            // 启动轮询任务
            if (config.pollCron) {
                ctx.logger.info(`已启用轮询，Cron表达式：${config.pollCron}`);
                const pollJob = cron.schedule(config.pollCron, checkStreamStatus);
                jobs.push({ username: 'general-poll', job: pollJob });
            }

            // 初始化数据库状态并创建自动推送任务
            for (const broadcaster of config.subscribeList) {
                await ctx.database.upsert('twitch_stream_status', [{ username: broadcaster.username, isStreaming: false }]);

                if (broadcaster.autoPushLiveinfoEnabled) {
                    const cronExp = `*/${broadcaster.autoPushLiveinfoIntervalMinute} * * * *`;
                    const logger = new Logger(`twitch-${broadcaster.username}`);
                    logger.info(`已启用自动推送直播信息，主播: ${broadcaster.username}，时间间隔: ${broadcaster.autoPushLiveinfoIntervalMinute} 分钟`);
                    const autoPushJob = cron.schedule(cronExp, () => autoPushLiveinfoForBroadcaster(broadcaster));
                    jobs.push({ username: broadcaster.username, job: autoPushJob });
                }
            }

        } catch (err) {
            ctx.logger.error('插件启动失败:', err);
        }
    });

    ctx.on('dispose', () => {
        for (const { username, job } of jobs) {
            job.stop();
            const logger = new Logger(`twitch-${username}`);
            logger.info(`(当前时间: ${formatDateTime()})定时任务已停止。主播名: ${username} `);
        }
    });

    // ==================== 📝 注册命令 ====================

    // 根指令
    ctx.command('tw', 'Twitch 插件指令');

    registerCheckCommand(ctx, config);   // tw.check
    registerConfigCommand(ctx, config);  // tw.config
    registerAllCommand(ctx, config);     // tw.all
}
