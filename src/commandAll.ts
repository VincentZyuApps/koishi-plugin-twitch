// commandAll.ts - tw.all 命令

import { Context } from 'koishi';

import { TWITCH_API_BASE_URL } from './types';
import { Config } from './config';
import { getAccessToken, getApiClient } from './utils';
import { renderAllStatus } from './renderAll';

/**
 * 注册 tw.all 命令
 */
export function registerAllCommand(ctx: Context, config: Config) {
    const apiClient = getApiClient();

    ctx.command('tw.all', '查询所有订阅主播的开播状态')
        .alias('twitch全部状态')
        .alias('检查所有twitch')
        .action(async ({ session }) => {
            const broadcasters = config.subscribeList;

            if (!broadcasters || broadcasters.length === 0) {
                return '📋 当前没有配置任何主播订阅。';
            }

            ctx.logger.info(`查询所有主播状态，共 ${broadcasters.length} 位`);

            try {
                const accessToken = await getAccessToken();

                // 批量获取用户信息
                const userLogins = broadcasters.map(b => b.username);
                const usersQuery = userLogins.map(u => `login=${u}`).join('&');
                const usersResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/users?${usersQuery}`, {
                    headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
                });

                // 构建映射
                const userInfoMap = new Map<string, any>();
                for (const user of usersResponse.data.data) {
                    userInfoMap.set(user.login.toLowerCase(), user);
                }

                // 批量查询直播状态
                const userIds = Array.from(userInfoMap.values()).map(u => u.id);
                const streamsQuery = userIds.map(id => `user_id=${id}`).join('&');
                const streamsResponse = await apiClient.get(`${TWITCH_API_BASE_URL}/streams?${streamsQuery}`, {
                    headers: { 'Client-ID': config.clientId, 'Authorization': `Bearer ${accessToken}` }
                });

                // 构建直播状态映射
                const streamMap = new Map<string, any>();
                for (const stream of streamsResponse.data.data) {
                    streamMap.set(stream.user_login.toLowerCase(), stream);
                }

                // 渲染输出
                await renderAllStatus(config, session, apiClient, broadcasters, streamMap);

                return;
            } catch (error: any) {
                ctx.logger.error('查询所有主播状态失败：', error.response?.data || error.message);
                return '查询主播状态时发生错误，请检查日志。';
            }
        });
}
