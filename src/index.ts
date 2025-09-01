// index.ts

import { Bot, Context, Logger, Schema, Session, h } from 'koishi';
import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import cron, { ScheduledTask } from 'node-cron';

import { PROXY_PROTOCOL, MSG_FORM, TWITCH_API_BASE_URL, TWITCH_OAUTH_URL, LiveInfo } from './types';
import { renderLiveImage } from './render';
import { fetchImageAsDataUrl, formatToLocalTime, getProfileImageAsDataUrl } from './utils';


export const name = 'twitch';
export const inject = {
    required: ["puppeteer", "database"]
};



declare module 'koishi' {
    interface Tables {
        twitch_stream_status: TwitchStreamStatus;
    }
}

export interface TwitchStreamStatus {
    username: string;
    isStreaming: boolean;
    lastLiveNotification: number; // UNIX timestamp
}

export const Config = Schema.intersect([
    Schema.object({
        msgFormArr: Schema.array(
            Schema.union([MSG_FORM.TEXT, MSG_FORM.IMAGE, MSG_FORM.FORWARD])
        )
            .default([MSG_FORM.TEXT])
            .role("checkbox")
            .description("消息发送形式。text=文本, image=图片, forward=合并转发(仅适用于onebot)"),
        quoteWhenSend: Schema.boolean()
            .default(true)
            .description("发消息的时候带有引用"),
        localTimezoneOffset: Schema.number()
            .min(-12).max(12).step(1).default(+8)
            .description("本地时区偏移量。默认GMT+8 东八区")
    }).description("消息发送形式配置"),

    Schema.object({
        clientId: Schema.string()
            .description('Twitch API Client ID')
            .required(),
        clientSecret: Schema.string()
            .description('Twitch API Client Secret')
            .required(),
        secret: Schema.string()
            .description('用于验证 Twitch 请求的密钥，建议使用 10-20 位随机字符串。')
            .required(),
        pollCron: Schema.string()
            .description('轮询查询的 Cron 表达式，例如 "0,30 * * * * *" 表示每分钟的 0 秒和 30 秒执行一次。')
            .default("0,30 * * * * *"),
        enableWebhook: Schema.boolean()
            .default(false)
            .disabled().experimental()
            .description("使用webhook而不是轮询 来查询主播是否开播。这是一个未来打算增加的功能，放一个disabled假按钮在这提醒自己。 这个功能可能会比较麻烦，可能需要把你的koishi部署到公网。再加上 我好像写不出来，有点问题hhh，所以就暂时搁置了。如果有能写出来的，欢迎fork+pr")
    }).description("Twitch 相关配置"),

    Schema.object({
        subscribeList: Schema.array(Schema.object({
            username: Schema.string()
                .description("主播名字，比如主播直播间地址是https://www.twitch.tv/vincentzyu/， 那么就填入vincentzyu")
                .required(),
            targetPlatformChannelId: Schema.array(Schema.object({
                platform: Schema.string()
                    .description('目标平台(比如qq,onebot,discord...)')
                    .required(),
                channelId: Schema.string()
                    .description('目标频道 ID(用inspect指令查看)')
                    .required(),
            })).role('table').description("目标平台频道 ID 列表"),
            autoPushLiveinfoEnabled: Schema.boolean()
                .description("是否启用自动推送直播信息")
                .default(true),
            autoPushLiveinfoIntervalMinute: Schema.number()
                .min(1).max(120).step(1).default(15)
                .description("自动推送直播信息的时间间隔。单位：分钟"),
        })).default([{
                username: "vincentzyu",
                targetPlatformChannelId: [{
                    platform: "onebot",
                    channelId: ""
                }],
                autoPushLiveinfoEnabled: true,
                autoPushLiveinfoIntervalMinute: 15,
            }])
            .description("订阅主播列表"),
    }).description("订阅相关配置"),

    Schema.object({
        proxy: Schema.object({
            enabled: Schema.boolean()
                .description('是否启用代理。')
                .default(true),
            protocol: Schema.union([
                Schema.const(PROXY_PROTOCOL.HTTP).description("HTTP 代理"),
                Schema.const(PROXY_PROTOCOL.HTTPS).description("HTTPS 代理"),
                Schema.const(PROXY_PROTOCOL.SOCKS4).description("SOCKS4 代理"),
                Schema.const(PROXY_PROTOCOL.SOCKS5).description("SOCKS5 代理"),
                Schema.const(PROXY_PROTOCOL.SOCKS5H).description("SOCKS5h 代理 (支持远程DNS)"),
            ]).role('radio').default(PROXY_PROTOCOL.SOCKS5H),
            host: Schema.string()
                .description('代理地址。')
                .default('192.168.31.84'),
            port: Schema.number()
                .description('代理端口。')
                .default(7891)
        })
    }).description("网络代理相关配置"),
]);

export async function apply(ctx: Context, config) {

    let apiClient: AxiosInstance;
    const jobs: ScheduledTask[] = [];

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
        streamData: any[]
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

        if (config.msgFormArr.includes(MSG_FORM.TEXT)) {
            messageElements.push(
                `主播${payload.user_name}正在Twitch直播!`,
                `标题：${payload.title}`,
                ...(profileImageBase64 ? [h.image(profileImageBase64)] : []),
                `开播时间: ${payload.started_at}`,
                `游戏：${payload.game_name}`,
                `观看人数：${payload.viewer_count}`,
                `链接：${payload.url}`,
                ...(coverImageBase64 ? [h.image(coverImageBase64)] : []),
            );

            if (session !== undefined) {
                await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${messageElements.join('\n')}`);
            } else {
                await bot.sendMessage(channelId, messageElements.join('\n'));
            }
        }

        if (config.msgFormArr.includes(MSG_FORM.IMAGE)) {
            // Fix: Added coverImageBase64 and profileImageBase64 as arguments
            const renderRes = await renderLiveImage(ctx, payload, coverImageBase64, profileImageBase64);
            if (!renderRes) return;

            const messageArr = [
                `主播${payload.user_name}正在Twitch直播!`,
                `${h.image(`data:image/png;base64,${renderRes}`)}`,
                `链接：${payload.url}`,
            ]

            if (session !== undefined) {
                await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${messageArr.join('\n')}`);
            } else {
                await bot.sendMessage(channelId, messageArr.join('\n'));
            }
        }

    }

    // 轮询检查函数
    async function checkStreamStatus() {
        ctx.logger.info("开始执行轮询任务...");
        const broadcasters = config.subscribeList;
        if (!broadcasters || broadcasters.length === 0) {
            ctx.logger.warn('未配置任何主播，跳过轮询。');
            return;
        }

        try {
            const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'client_credentials',
            });
            const accessToken = tokenResponse.data.access_token;

            for (const broadcaster of broadcasters) {
                const { username, targetPlatformChannelId, autoPushLiveinfoEnabled, autoPushLiveinfoIntervalMinute } = broadcaster;
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
                    // 更新数据库状态
                    await ctx.database.upsert('twitch_stream_status', [{ username, isStreaming: true }]);

                    for (const { platform, channelId } of targetPlatformChannelId) {
                        const bot = ctx.bots.find(b => b.platform === platform);
                        if (!bot) {
                            logger.warn(`未找到平台为 "${platform}" 的机器人，跳过发送。`);
                            continue;
                        }
                        await sendLiveNotification(ctx, config, undefined, bot, channelId, apiClient, streamData);
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
        } catch (error: any) {
            ctx.logger.error('轮询检查开播状态失败：', error.response?.data || error.message);
        }
    }

    // 自动推送直播信息的核心逻辑
    async function autoPushLiveinfo() {
        ctx.logger.info("开始执行自动推送任务...");
        const broadcasters = config.subscribeList;
        if (!broadcasters || broadcasters.length === 0) {
            ctx.logger.warn('未配置任何主播，跳过自动推送。');
            return;
        }

        try {
            const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'client_credentials',
            });
            const accessToken = tokenResponse.data.access_token;

            for (const broadcaster of broadcasters) {
                const { username, targetPlatformChannelId, autoPushLiveinfoEnabled, autoPushLiveinfoIntervalMinute } = broadcaster;
                const logger = new Logger(`twitch-${username}`);

                if (!autoPushLiveinfoEnabled) continue;

                let dbStatus = await ctx.database.get('twitch_stream_status', { username });
                let isStreaming = dbStatus[0]?.isStreaming || false;

                if (!isStreaming) {
                    logger.info(`自动推送：主播 ${username} 当前未开播，跳过推送。`);
                    continue;
                }

                const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${username}`, {
                    headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
                });
                const broadcasterUserId = usersResponse.data.data[0].id;

                const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?user_id=${broadcasterUserId}`, {
                    headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` },
                });

                const streamData = streamsResponse.data.data;
                if (streamData.length > 0) {
                    logger.info(`自动推送开播信息：${username}`);

                    for (const { platform, channelId } of targetPlatformChannelId) {
                        const bot = ctx.bots.find(b => b.platform === platform);
                        if (!bot) {
                            logger.warn(`未找到平台为 "${platform}" 的机器人，跳过自动推送。`);
                            continue;
                        }
                        await sendLiveNotification(ctx, config, undefined, bot, channelId, apiClient, streamData);
                    }
                }
            }
        } catch (error: any) {
            ctx.logger.error('自动推送直播信息失败：', error.response?.data || error.message);
        }
    }

    ctx.on('ready', async () => {
        try {
            if (config.pollCron) {
                ctx.logger.info(`已启用轮询，Cron表达式：${config.pollCron}`);
                const pollJob = cron.schedule(config.pollCron, checkStreamStatus);
                jobs.push(pollJob);
            }

            // 初始化数据库状态
            for (const broadcaster of config.subscribeList) {
                await ctx.database.upsert('twitch_stream_status', [{ username: broadcaster.username, isStreaming: false }]);

                if (broadcaster.autoPushLiveinfoEnabled) {
                    const cronExp = `*/${broadcaster.autoPushLiveinfoIntervalMinute} * * * *`;
                    const logger = new Logger(`twitch-${broadcaster.username}`);
                    logger.info(`已启用自动推送直播信息，主播: ${broadcaster.username}，时间间隔: ${broadcaster.autoPushLiveinfoIntervalMinute} 分钟`);
                    const autoPushJob = cron.schedule(cronExp, autoPushLiveinfo);
                    jobs.push(autoPushJob);
                }
            }

        } catch (err) {
            ctx.logger.error('插件启动失败:', err);
        }
    });

    ctx.on('dispose', () => {
        for (const job of jobs) {
            job.stop();
            ctx.logger.info(`定时任务已停止。`)
        }
    });

    // atc 指令，支持动态查询
    ctx.command('atc [username:string]', '检查主播开播状态')
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
                const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    grant_type: 'client_credentials',
                });
                const accessToken = tokenResponse.data.access_token;

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
                logger.info(`streamData = ${JSON.stringify(streamData)}`)

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