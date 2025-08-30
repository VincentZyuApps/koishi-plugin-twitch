// index.ts
import { createHmac } from 'crypto';

import { Context, Schema, Session, h } from 'koishi';
import Fastify from 'fastify';
import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import cron, { ScheduledTask } from 'node-cron';

import { PROXY_PROTOCOL, MSG_FORM, TWITCH_API_BASE_URL, TWITCH_OAUTH_URL, LiveInfo } from './types';
import { renderLiveImage } from './render';
import { fetchImageAsDataUrl, getProfileImageAsDataUrl } from './utils';


export const name = 'twitch-stream-notifier-fastify';
export const inject = {
    required: ["puppeteer"]
};

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
        broadcasterLogin: Schema.string()
            .description('要订阅的主播登录名，例如：vincentzyu')
            .required(),
        callbackUrl: Schema.string()
            .description('Webhook 回调 URL，例如 ngrok 或 FRP 提供的公网地址。')
            .required(),
        secret: Schema.string()
            .description('用于验证 Twitch 请求的密钥，建议使用 10-20 位随机字符串。')
            .required(),
        webhookHost: Schema.string()
            .description('独立的 Webhook 监听主机地址。')
            .default('0.0.0.0'),
        webhookPort: Schema.number()
            .description('独立的 Webhook 监听端口。')
            .default(8829),
    }).description("Twitch 相关配置"),

    Schema.object({
        targetPlatformChannelId: Schema.array(Schema.object({
            platform: Schema.string()
                .description('目标平台'),
            channelId: Schema.string()
                .description('目标频道 ID'),
        })).role('table').description("目标平台频道 ID 列表"),
        autoPushLiveinfoEnabled: Schema.boolean()
            .description("是否启用自动推送直播信息")
            .default(true),
        autoPushLiveinfoIntervalMinute: Schema.number()
            .min(1).max(120).step(1).default(15)
            .description("自动推送直播信息的时间间隔。单位：分钟"),
    }),

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
        }).description("网络代理配置")
    }),

    Schema.object({
        pollEnabled: Schema.boolean()
            .description('是否启用轮询查询。')
            .default(false),
    }).description("轮询配置"),
    Schema.union([
        Schema.object({
            pollEnabled: Schema.const(true as const).required(),
            pollCron: Schema.string()
                .description('轮询查询的 Cron 表达式，例如 "0,30 * * * * *" 表示每分钟的 0 秒和 30 秒执行一次。')
                .default("0,30 * * * * *"),
        }),
        Schema.object({}),
    ])
]);


// 抽象出解析和发送消息的函数
async function sendLiveNotification(
    ctx: Context,
    config,
    session: Session,
    apiClient: AxiosInstance,
    streamData: any[]
) {
    if (streamData.length === 0) {
        return '主播当前没有在直播。';
    }

    const stream = streamData[0];

    // 格式化数据，和原来的 parseTwitchLiveInfo 逻辑一样，但直接内联
    const payload: LiveInfo = {
        user_name: stream.user_name,
        title: stream.title,
        started_at: stream.started_at,
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
            await session.send(messageElements.join('\n'));
        }
    }

    if (config.msgFormArr.includes(MSG_FORM.IMAGE)) {
        // 使用新的图片代理 URL
        const coverImageUrl = `http://${config.webhookHost}:${config.webhookPort}/image?type=cover&broadcaster_login=${payload.user_login}`;
        const profileImageUrl = `http://${config.webhookHost}:${config.webhookPort}/image?type=profile&broadcaster_login=${payload.user_login}`;

        const renderRes = await renderLiveImage(ctx, payload, coverImageUrl, profileImageUrl);
        if (!renderRes) return;

        const messageArr = [
                `主播${payload.user_name}正在Twitch直播!`,
                `${h.image(`data:image/png;base64,${renderRes}`)}`,
                `链接：${payload.url}`,
        ]

        if (session !== undefined) {
            await session.send(`${config.quoteWhenSend ? h.quote(session.messageId) : ''}${messageArr.join('\n')}`);
        } else {
            await session.send( messageArr.join('\n') );
        }
    }
    
}

export async function apply(ctx: Context, config) {

    let broadcasterUserId: string | null = null;
    const webhookServer = Fastify();
    let apiClient: AxiosInstance;
    let isStreaming = false; // 新增：用于跟踪开播状态
    let profileImageCache: Buffer | null = null;
    let coverImageCache: Buffer | null = null;
    const jobs: ScheduledTask[] = []; // 新增：用于管理定时任务

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

    // 新增：图片代理路由
    webhookServer.get('/image', async (req, reply) => {
        const { type, broadcaster_login } = req.query as { type: string, broadcaster_login: string };

        if (!type || !broadcaster_login) {
            return reply.code(400).send('Invalid query parameters');
        }

        try {
            let buffer: Buffer | null = null;
            if (type === 'profile') {
                if (profileImageCache) {
                    buffer = profileImageCache;
                } else {
                    const profileImageUrl = (await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${broadcaster_login}`, {
                        headers: {
                            'Client-ID': config.clientId,
                            'Authorization': `Bearer ${(await apiClient.post(TWITCH_OAUTH_URL, {
                                client_id: config.clientId,
                                client_secret: config.clientSecret,
                                grant_type: 'client_credentials'
                            })).data.access_token}`
                        }
                    })).data.data[0].profile_image_url;
                    const res = await apiClient.get(profileImageUrl, { responseType: 'arraybuffer' });
                    buffer = Buffer.from(res.data);
                    profileImageCache = buffer; // 缓存头像图片
                }
                reply.type('image/jpeg').send(buffer);
            } else if (type === 'cover') {
                // 封面图可能需要动态获取，因为直播会更换
                const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?user_login=${broadcaster_login}`, {
                    headers: {
                        'Client-ID': config.clientId,
                        'Authorization': `Bearer ${(await apiClient.post(TWITCH_OAUTH_URL, {
                            client_id: config.clientId,
                            client_secret: config.clientSecret,
                            grant_type: 'client_credentials'
                        })).data.access_token}`
                    }
                });
                const thumbnailUrl = streamsResponse.data.data[0].thumbnail_url.replace("{width}", "1920").replace("{height}", "1080");
                const res = await apiClient.get(thumbnailUrl, { responseType: 'arraybuffer' });
                buffer = Buffer.from(res.data);
                coverImageCache = buffer; // 缓存封面图片
                reply.type('image/jpeg').send(buffer);
            } else {
                reply.code(404).send('Not Found');
            }
        } catch (error: any) {
            ctx.logger.error(`Error proxying image request for type "${type}":`, error.message);
            reply.code(500).send('Internal Server Error');
        }
    });
    
    // 只有在 pollEnabled 为 false 时才注册 Webhook 路由
    if (!config.pollEnabled) {
        // 1. 设置 Webhook 路由
        webhookServer.post('/twitch-webhook', async (req, reply) => {
            let rawBody;
            try {
                rawBody = await new Promise<Buffer>((resolve, reject) => {
                    const bodyChunks: any[] = [];
                    req.raw.on('data', (chunk) => bodyChunks.push(chunk));
                    req.raw.on('end', () => resolve(Buffer.concat(bodyChunks)));
                    req.raw.on('error', reject);
                });
            } catch (err) {
                reply.code(400).send('Bad Request');
                return;
            }

            if (!rawBody) {
                reply.code(400).send('Bad Request');
                return;
            }

            const messageId = req.headers['twitch-eventsub-message-id'];
            const messageTimestamp = req.headers['twitch-eventsub-message-timestamp'];
            const messageSignature = req.headers['twitch-eventsub-message-signature'];

            const hmac = createHmac('sha256', config.secret);
            hmac.update(String(messageId) + String(messageTimestamp) + rawBody);
            const signature = `sha256=${hmac.digest('hex')}`;

            if (signature !== messageSignature) {
                ctx.logger.warn('Webhook 签名验证失败，请求被拒绝。');
                reply.code(403).send('Signature mismatch');
                return;
            }

            const messageType = req.headers['twitch-eventsub-message-type'];
            const body = JSON.parse(rawBody.toString());

            if (messageType === 'webhook_callback_verification') {
                ctx.logger.info('收到 Twitch Webhook 验证请求，返回 challenge。');
                reply.code(200).send(body.challenge);
            } else if (messageType === 'notification') {
                const event = body.event;
                if (body.subscription.type === 'stream.online' && event.broadcaster_user_id === broadcasterUserId) {
                    ctx.logger.info(`收到开播通知：${event.broadcaster_user_name}`);
                    isStreaming = true;
                    
                    // 清空图片缓存，确保下次获取最新的封面图
                    coverImageCache = null;
                    
                    const messageToSend = await sendLiveNotification(ctx, config, undefined, apiClient, [event]);
                    
                    for (const { platform, channelId } of config.targetPlatformChannelId) {
                        const bot = ctx.bots.find(b => b.platform === platform);
                        if (!bot) {
                            ctx.logger.warn(`未找到平台为 "${platform}" 的机器人，跳过发送。`);
                            continue;
                        }
                        await bot.sendMessage(channelId, messageToSend);
                    }
                }
                reply.code(200).send('OK');
            } else {
                reply.code(200).send('OK');
            }
        });
    }

    // 订阅开播事件的函数
    async function subscribeToTwitchEvents() {
        try {
            const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'client_credentials'
            });
            const accessToken = tokenResponse.data.access_token;
            const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${config.broadcasterLogin}`, {
                headers: {
                    'Client-ID': config.clientId,
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            broadcasterUserId = usersResponse.data.data[0].id;
            ctx.logger.info(`已获取主播 ${config.broadcasterLogin} 的用户 ID：${broadcasterUserId}`);

            const subscriptionBody = {
                type: 'stream.online',
                version: '1',
                condition: { broadcaster_user_id: broadcasterUserId },
                transport: {
                    method: 'webhook',
                    callback: `${config.callbackUrl}`,
                    secret: config.secret
                }
            };

            await apiClient.post(`${TWITCH_API_BASE_URL}/eventsub/subscriptions`, subscriptionBody, {
                headers: {
                    'Client-ID': config.clientId,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            ctx.logger.info(`已成功订阅主播 ${config.broadcasterLogin} 的开播事件。`);
        } catch (error: any) {
            ctx.logger.error('订阅 Twitch 事件失败：', error.response?.data || error.message);
        }
    }

    // 轮询检查函数
    async function checkStreamStatus() {
        try {
            if (!broadcasterUserId) {
                ctx.logger.warn('未获取到主播用户ID，跳过轮询。');
                return;
            }

            const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'client_credentials'
            });
            const accessToken = tokenResponse.data.access_token;

            const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?user_id=${broadcasterUserId}`, {
                headers: {
                    'Client-ID': config.clientId,
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const streamData = streamsResponse.data.data;
            if (streamData.length > 0) {
                if (!isStreaming) {
                    isStreaming = true;
                    ctx.logger.info(`轮询发现开播：${streamData[0].user_name}`);
                    
                    // 清空图片缓存，确保下次获取最新的封面图
                    coverImageCache = null;

                    const messageToSend = await sendLiveNotification(ctx, config, undefined, apiClient, streamData);
                    
                    for (const { platform, channelId } of config.targetPlatformChannelId) {
                        const bot = ctx.bots.find(b => b.platform === platform);
                        if (!bot) continue;
                        await bot.sendMessage(channelId, messageToSend);
                    }
                }
            } else {
                if (isStreaming) {
                    isStreaming = false;
                    ctx.logger.info('轮询发现下播。');
                    
                    // 下播通知
                    const messageToSend = `主播 ${config.broadcasterLogin} 已下播。`;
                    for (const { platform, channelId } of config.targetPlatformChannelId) {
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

    // 新增：自动推送直播信息的核心逻辑
    async function autoPushLiveinfo() {
        try {
            if (!broadcasterUserId) {
                const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${config.broadcasterLogin}`, {
                    headers: {
                        'Client-ID': config.clientId,
                        'Authorization': `Bearer ${(await apiClient.post(TWITCH_OAUTH_URL, {
                            client_id: config.clientId,
                            client_secret: config.clientSecret,
                            grant_type: 'client_credentials'
                        })).data.access_token}`
                    }
                });
                broadcasterUserId = usersResponse.data.data[0].id;
            }

            const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'client_credentials',
            });
            const accessToken = tokenResponse.data.access_token;
            
            const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?user_id=${broadcasterUserId}`, {
                headers: {
                    'Client-ID': config.clientId,
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            const streamData = streamsResponse.data.data;
            // 只有当主播在直播时才推送
            if (streamData.length > 0) {
                ctx.logger.info(`自动推送开播信息：${streamData[0].user_name}`);
                const messageToSend = await sendLiveNotification(ctx, config, undefined, apiClient, streamData);
                
                for (const { platform, channelId } of config.targetPlatformChannelId) {
                    const bot = ctx.bots.find(b => b.platform === platform);
                    if (!bot) {
                        ctx.logger.warn(`未找到平台为 "${platform}" 的机器人，跳过自动推送。`);
                        continue;
                    }
                    await bot.sendMessage(channelId, messageToSend);
                }
            } else {
                ctx.logger.info('自动推送：主播当前未开播，跳过推送。');
            }
        } catch (error: any) {
            ctx.logger.error('自动推送直播信息失败：', error.response?.data || error.message);
        }
    }

    ctx.on('ready', async () => {
        try {
            await webhookServer.listen({ port: config.webhookPort, host: config.webhookHost });
            ctx.logger.info(`服务器已在 http://${config.webhookHost}:${config.webhookPort} 启动。`);
            
            if (!config.pollEnabled) {
                subscribeToTwitchEvents();
            }

            if (config.pollEnabled && config.pollCron) {
                ctx.logger.info(`已启用轮询，Cron表达式：${config.pollCron}`);
                cron.schedule(config.pollCron, checkStreamStatus);
            }

            // 新增：自动推送定时任务
            if (config.autoPushLiveinfoEnabled) {
                const cronExp = `*/${config.autoPushLiveinfoIntervalMinute} * * * *`;
                await autoPushLiveinfo();
                ctx.logger.info(`已启用自动推送直播信息，时间间隔：${config.autoPushLiveinfoIntervalMinute} 分钟`);
                const autoPushJob = cron.schedule(cronExp, autoPushLiveinfo);
                jobs.push(autoPushJob);
            }
        } catch (err) {
            ctx.logger.error('服务器启动失败:', err);
        }
    });

    ctx.on('dispose', () => {
        webhookServer.close();
        ctx.logger.info('服务器已关闭。');

        for (const job of jobs) {
            job.stop();
            ctx.logger.info(`定时任务${job}已经停止。`)
        }
    });

    // atc 指令
    ctx.command('atc', '检查主播开播状态')
        .alias('awa_twitch_check')
        .action(async ({ session }) => {
            try {
                if (!broadcasterUserId) {
                    const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?login=${config.broadcasterLogin}`, {
                        headers: {
                            'Client-ID': config.clientId,
                            'Authorization': `Bearer ${(await apiClient.post(TWITCH_OAUTH_URL, {
                                client_id: config.clientId,
                                client_secret: config.clientSecret,
                                grant_type: 'client_credentials'
                            })).data.access_token}`
                        }
                    });
                    broadcasterUserId = usersResponse.data.data[0].id;
                }

                const tokenResponse = await apiClient.post(TWITCH_OAUTH_URL, {
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    grant_type: 'client_credentials',
                });
                const accessToken = tokenResponse.data.access_token;

                const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?user_id=${broadcasterUserId}`, {
                    headers: {
                        'Client-ID': config.clientId,
                        'Authorization': `Bearer ${accessToken}`,
                    },
                });

                const streamData = streamsResponse.data.data;
                
                await sendLiveNotification(ctx, config, session, apiClient, streamData);
                
                return;
            } catch (error: any) {
                ctx.logger.error('检查开播状态失败：', error.response?.data || error.message);
                return '检查开播状态时发生错误，请检查日志。';
            }
        });
}