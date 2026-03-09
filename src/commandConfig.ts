// commandConfig.ts - tw.config 命令

import { Context } from 'koishi';

import { Config } from './config';
import { renderConfigInfo } from './renderConfig';

/**
 * 注册 tw.config 命令
 */
export function registerConfigCommand(ctx: Context, config: Config) {
    ctx.command('tw.config', '打印当前 Twitch 订阅配置')
        .alias('twitch配置')
        .alias('twitch订阅列表')
        .action(async ({ session }) => {
            const broadcasters = config.subscribeList;

            if (!broadcasters || broadcasters.length === 0) {
                return '📋 当前没有配置任何主播订阅。';
            }

            await renderConfigInfo(config, session, broadcasters);

            return;
        });
}
