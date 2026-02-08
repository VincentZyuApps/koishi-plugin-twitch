// 📄 config.ts

import { Schema } from 'koishi';
import { PROXY_PROTOCOL, MSG_FORM } from './types';

// ==================== 📦 类型定义 ====================

export interface TwitchStreamStatus {
    username: string;
    isStreaming: boolean;
    lastLiveNotification: number; // UNIX timestamp
}

export interface TargetPlatformChannel {
    platform: string;
    channelId: string;
    enableSendLink: boolean;
}

export interface BroadcasterConfig {
    username: string;
    targetPlatformChannelId: TargetPlatformChannel[];
    autoPushLiveinfoEnabled: boolean;
    autoPushLiveinfoIntervalMinute: number;
}

export interface ProxyConfig {
    enabled: boolean;
    protocol: string;
    host: string;
    port: number;
}

export interface Config {
    // 💬 消息发送形式配置
    msgFormArr: string[];
    quoteWhenSend: boolean;
    localTimezoneOffset: number;

    // 📺 Twitch 相关配置
    clientId: string;
    clientSecret: string;
    secret: string;
    pollCron: string;
    enableWebhook: boolean;

    // 📋 订阅相关配置
    subscribeList: BroadcasterConfig[];

    // 🌐 网络代理相关配置
    proxy: ProxyConfig;
}

// ==================== ⚙️ Schema 定义 ====================

export const Config: Schema<Config> = Schema.intersect([
    // 💬 消息发送形式配置
    Schema.object({
        msgFormArr: Schema.array(
            Schema.union([MSG_FORM.TEXT, MSG_FORM.PUPPETEER_IMAGE, MSG_FORM.RAW_IMAGE, MSG_FORM.FORWARD])
        )
            .default([MSG_FORM.PUPPETEER_IMAGE])
            .role("checkbox")
            .description(`📨 消息发送形式（可多选）：
- 📝 **text** - *纯文本*，只发送文字信息
- 🎨 **puppeteer_image** - *Puppeteer 渲染模板图*，精美卡片样式
- 🖼️ **raw_image** - *原始头像+封面图*，直接发送直播间图片
- 📦 **forward** - *合并转发*，仅适用于 OneBot 平台`),
        quoteWhenSend: Schema.boolean()
            .default(true)
            .description("💬 发消息的时候带有引用"),
        localTimezoneOffset: Schema.number()
            .min(-12).max(12).step(1).default(+8)
            .description("🕐 本地时区偏移量。默认 GMT+8 东八区")
    }).description("💬 消息发送形式配置"),

    // 📺 Twitch 相关配置
    Schema.object({
        clientId: Schema.string()
            .description('🔑 Twitch API Client ID')
            .required(),
        clientSecret: Schema.string()
            .description('🔐 Twitch API Client Secret')
            .required(),
        secret: Schema.string()
            .description('🛡️ 用于验证 Twitch 请求的密钥，建议使用 10-20 位随机字符串')
            .required(),
        pollCron: Schema.string()
            .description('⏰ 轮询查询的 Cron 表达式，例如 "0,30 * * * * *" 表示每分钟的 0 秒和 30 秒执行一次')
            .default("0,30 * * * * *"),
        enableWebhook: Schema.boolean()
            .default(false)
            .disabled().experimental()
            .description("🚧 使用 Webhook 而不是轮询来查询主播是否开播。这是一个未来打算增加的功能，放一个 disabled 假按钮在这提醒自己。这个功能可能会比较麻烦，可能需要把你的 Koishi 部署到公网。再加上我好像写不出来，有点问题 hhh，所以就暂时搁置了。如果有能写出来的，欢迎 fork+pr")
    }).description("📺 Twitch 相关配置"),

    // 📋 订阅相关配置
    Schema.object({
        subscribeList: Schema.array(Schema.object({
            username: Schema.string()
                .description("👤 主播名字，比如主播直播间地址是 https://www.twitch.tv/vincentzyu/，那么就填入 vincentzyu")
                .required(),
            targetPlatformChannelId: Schema.array(Schema.object({
                platform: Schema.string()
                    .description('🤖 目标平台（比如 qq, onebot, discord...）')
                    .required(),
                channelId: Schema.string()
                    .description('📍 目标频道 ID（用 inspect 指令查看）')
                    .required(),
                enableSendLink: Schema.boolean()
                    .description('🔗 是否发送直播链接')
                    .default(true),
            })).role('table').description("📋 目标平台频道 ID 列表"),
            autoPushLiveinfoEnabled: Schema.boolean()
                .description("🔔 是否启用自动推送直播信息")
                .default(true),
            autoPushLiveinfoIntervalMinute: Schema.number()
                .min(1).max(120).step(1).default(15)
                .description("⏱️ 自动推送直播信息的时间间隔（单位：分钟）"),
        })).default([{
            username: "vincentzyu",
            targetPlatformChannelId: [{
                platform: "onebot",
                channelId: "",
                enableSendLink: true
            }],
            autoPushLiveinfoEnabled: true,
            autoPushLiveinfoIntervalMinute: 15,
        }])
            .description("📋 订阅主播列表"),
    }).description("📋 订阅相关配置"),

    // 🌐 网络代理相关配置
    Schema.object({
        proxy: Schema.object({
            enabled: Schema.boolean()
                .description('🔌 是否启用代理')
                .default(true),
            protocol: Schema.union([
                Schema.const(PROXY_PROTOCOL.HTTP).description("🌐 HTTP 代理"),
                Schema.const(PROXY_PROTOCOL.HTTPS).description("🔒 HTTPS 代理"),
                Schema.const(PROXY_PROTOCOL.SOCKS4).description("🧦 SOCKS4 代理"),
                Schema.const(PROXY_PROTOCOL.SOCKS5).description("🧦 SOCKS5 代理"),
                Schema.const(PROXY_PROTOCOL.SOCKS5H).description("🧦 SOCKS5h 代理（支持远程 DNS）"),
            ]).role('radio').default(PROXY_PROTOCOL.SOCKS5H),
            host: Schema.string()
                .description('🏠 代理地址')
                .default('192.168.31.84'),
            port: Schema.number()
                .description('🚪 代理端口')
                .default(7891)
        })
    }).description("🌐 网络代理相关配置"),
]);

// ==================== 🗄️ 数据库表声明 ====================

declare module 'koishi' {
    interface Tables {
        twitch_stream_status: TwitchStreamStatus;
    }
}
