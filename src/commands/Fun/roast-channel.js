import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getRoastChannel, setRoastChannel, disableRoastChannel } from '../../services/roastService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('roast-channel')
        .setDescription('(Admin) Set up a channel where the bot roasts everyone who talks')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Designate the roast channel')
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('The channel where members get roasted')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) => sub.setName('disable').setDescription('Turn off the roast channel'))
        .addSubcommand((sub) => sub.setName('status').setDescription('See which channel is the roast channel')),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: 64 });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError(
                'Missing permissions',
                ErrorTypes.PERMISSION,
                'You need the **Manage Server** permission to use this.'
            );
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'set') {
            const channel = interaction.options.getChannel('channel');
            await setRoastChannel(client, guildId, channel.id);

            // Announce it in the roast channel itself, in character.
            await channel
                .send({
                    embeds: [
                        infoEmbed(
                            '🔥 The Roast Pit is OPEN',
                            'This is now the official **Roast Channel**. 👻\n\n' +
                                'Say anything in here and I *will* have something to say back. ' +
                                'Your balance, your job, your gambling history — nothing is off the table.\n\n' +
                                '💡 I\'m also weirdly useful — try:\n' +
                                '• "weather in Tokyo" · "what time is it" · "what\'s 128 * 42"\n' +
                                '• "search for best pizza recipe" · "find me the song Blinding Lights"\n' +
                                '• "directions from Amsterdam to Paris" · "GTA 6 news" · "gif of a happy cat"\n' +
                                'You\'ll get a real answer... and a roast on the side.\n\n' +
                                "Talk at your own risk. Don't cry to the mods. 🔥"
                        ),
                    ],
                })
                .catch(() => null);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '🔥 Roast Channel Set',
                        `${channel.toString()} is now the roast channel. Every message in there gets a reply from the bot — contextual comebacks, personalized burns based on their economy stats, and classic roasts.\n\nDisable anytime with \`/roast-channel disable\`.`
                    ),
                ],
            });
            return;
        }

        if (subcommand === 'disable') {
            await disableRoastChannel(client, guildId);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('🧯 Roast Channel Disabled', 'The roast pit has been extinguished. Members may speak safely again.')],
            });
            return;
        }

        // status
        const channelId = await getRoastChannel(client, guildId);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    '🔥 Roast Channel Status',
                    channelId
                        ? `The roast channel is <#${channelId}>. Enter at your own risk.`
                        : 'No roast channel is set. Use `/roast-channel set` to open the pit.'
                ),
            ],
        });
    }, { command: 'roast-channel' })
};
