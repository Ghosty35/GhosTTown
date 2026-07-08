import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Matches crime.js's JAIL_TIME — kept in sync manually since jail state
// is shared across both commands via userData.jailedUntil.
const JAIL_TIME = 2 * 60 * 1000;
const ATTEMPT_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('jailbreak')
        .setDescription('Attempt to break a jailed member out — 50/50 odds')
        .addUserOption((option) =>
            option.setName('target').setDescription('Who to break out of jail').setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const rescuerId = interaction.user.id;
        const targetUser = interaction.options.getUser('target');
        const guildId = interaction.guildId;
        const now = Date.now();

        if (rescuerId === targetUser.id) {
            throw createError('Cannot break yourself out', ErrorTypes.VALIDATION, "You can't break yourself out of jail — ask someone else.");
        }

        if (targetUser.bot) {
            throw createError('Cannot target a bot', ErrorTypes.VALIDATION, "Bots don't go to jail.");
        }

        const rescuerData = await getEconomyData(client, guildId, rescuerId);
        const targetData = await getEconomyData(client, guildId, targetUser.id);

        const rescuerIsJailed = rescuerData.jailedUntil && rescuerData.jailedUntil > now;
        if (rescuerIsJailed) {
            const remaining = Math.ceil((rescuerData.jailedUntil - now) / (1000 * 60));
            throw createError(
                'Rescuer is in jail',
                ErrorTypes.VALIDATION,
                `You're in jail yourself for ${remaining} more minute(s) — you can't break anyone else out right now.`
            );
        }

        const targetIsJailed = targetData.jailedUntil && targetData.jailedUntil > now;
        if (!targetIsJailed) {
            throw createError('Target is not in jail', ErrorTypes.VALIDATION, `${targetUser.username} isn't in jail right now.`);
        }

        const lastAttempt = rescuerData.lastJailbreakAttempt || 0;
        if (now < lastAttempt + ATTEMPT_COOLDOWN) {
            const remaining = Math.ceil((lastAttempt + ATTEMPT_COOLDOWN - now) / 1000);
            throw createError(
                'Jailbreak attempt on cooldown',
                ErrorTypes.RATE_LIMIT,
                `You need to wait ${remaining}s before attempting another jailbreak.`
            );
        }

        rescuerData.lastJailbreakAttempt = now;
        const success = Math.random() < 0.5;

        if (success) {
            targetData.jailedUntil = 0;
            await setEconomyData(client, guildId, targetUser.id, targetData);
            await setEconomyData(client, guildId, rescuerId, rescuerData);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '🔓 Jailbreak Successful!',
                        `${interaction.user.toString()} snuck in and broke **${targetUser.username}** out of jail! They're free to go.`
                    ),
                ],
            });
        } else {
            rescuerData.jailedUntil = now + JAIL_TIME;
            await setEconomyData(client, guildId, rescuerId, rescuerData);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    warningEmbed(
                        '🚔 Jailbreak Failed!',
                        `${interaction.user.toString()} got caught trying to break **${targetUser.username}** out — and got thrown in jail themselves!`
                    ),
                ],
            });
        }
    }, { command: 'jailbreak' })
};
