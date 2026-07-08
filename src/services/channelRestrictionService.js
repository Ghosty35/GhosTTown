// channelRestrictionService.js
//
// Restricts specific commands to specific channels per guild. Commands
// not covered by any group are unrestricted (usable anywhere) — this is
// opt-in per command group, not a lockdown of the whole bot.
//
// The "story" group is special-cased to reuse storyService's existing
// channel config (set via /story channel) instead of a separate one, so
// there's a single source of truth for where the word game runs.

import { getStoryConfig } from './storyService.js';

function configKey(guildId) {
    return `channel-restrictions:${guildId}`;
}

// Command -> group mapping. Admins assign a channel to each group with
// /channel-restrict set. Add a command's name here to bring it under
// channel restriction; anything not listed is unrestricted.
export const COMMAND_GROUPS = {
    banking: ['atm', 'balance', 'deposit', 'withdraw', 'pay'],
    work: ['work', 'beg', 'fish', 'mine', 'crime', 'daily', 'job', 'my-stats'],
    gamecorner: ['casino', 'rob', 'invest', 'jailbreak'],
};

export const GROUP_LABELS = {
    banking: 'Banking',
    work: 'Work',
    gamecorner: 'Game Corner',
    story: 'Word Story',
};

export async function getChannelRestrictions(client, guildId) {
    return (await client.db.get(configKey(guildId))) || {};
}

export async function setGroupChannel(client, guildId, group, channelId) {
    const restrictions = await getChannelRestrictions(client, guildId);
    restrictions[group] = channelId;
    await client.db.set(configKey(guildId), restrictions);
    return restrictions;
}

function findGroupForCommand(commandName) {
    for (const [group, commands] of Object.entries(COMMAND_GROUPS)) {
        if (commands.includes(commandName)) return group;
    }
    return null;
}

/**
 * Called once per command execution from interactionCreate.js.
 * Returns { allowed: boolean, requiredChannelId?: string, group?: string }
 */
export async function checkChannelRestriction(client, guildId, channelId, commandName) {
    if (commandName === 'story') {
        const storyConfig = await getStoryConfig(client, guildId);
        if (!storyConfig.channelId) return { allowed: true }; // not set up yet — don't block setup itself
        return { allowed: channelId === storyConfig.channelId, requiredChannelId: storyConfig.channelId, group: 'story' };
    }

    const group = findGroupForCommand(commandName);
    if (!group) return { allowed: true }; // this command isn't restricted

    const restrictions = await getChannelRestrictions(client, guildId);
    const requiredChannelId = restrictions[group];
    if (!requiredChannelId) return { allowed: true }; // admin hasn't assigned a channel yet — don't block

    return { allowed: channelId === requiredChannelId, requiredChannelId, group };
}
