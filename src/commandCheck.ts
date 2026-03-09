// commandCheck.ts - tw.check 命令

import { Context, Logger } from 'koishi';

import { TWITCH_API_BASE_URL } from './types';
import { Config } from './config';
import { getAccessToken, getApiClient } from './utils';
import { sendLiveNotification } from './renderCheck';

/**
 * 注册 tw.check 命令
 */
export function registerCheckCommand(ctx: Context, config: Config) {
    const apiClient = getApiClient();

    ctx.command('tw.check [username:string]', '检查主播开播状态, 传入主播名参数。比如这个直播间：https://www.twitch.tv/nacho_dayo，那么就输入 `tw.check nacho_dayo`')
        .alias('检查twitch开播')
        .alias('atc')
        .alias('awa_twitch_check')
        .action(async ({ session }, username) => {
            // 优先使用传入参数，其次配置项，最后硬编码默认值
            const fallbackUsername = 'nacho_dayo';
            const targetUsername = username || config.defaultCheckUsername || fallbackUsername;

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
