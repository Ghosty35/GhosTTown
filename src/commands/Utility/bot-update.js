import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('bot-update')
        .setDescription('(Admin) Post the latest bot update announcement to a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Channel to post the announcement in (defaults to this channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .addRoleOption((option) =>
            option
                .setName('ping')
                .setDescription('Role to ping with the announcement (optional)')
                .setRequired(false)
        ),

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

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const pingRole = interaction.options.getRole('ping');

        // ---------------------------------------------------------------
        // 1) HEADER
        // ---------------------------------------------------------------
        const headerEmbed = createEmbed({
            title: '📢👻 BOT UPDATE — Economy & Stock Market Overhaul',
            description:
                'Big drop today, ghosts! 🎉\n\n' +
                'A brand-new **🏦 Stock Market Heist**, a stock powered by **your chat activity**, and a full **💹 market rebalance**.\n\n' +
                'Get trading, get heisting — the market is watching. 👀',
            color: 'economy',
        });

        // ---------------------------------------------------------------
        // 2) STOCK MARKET HEIST
        // ---------------------------------------------------------------
        const heistEmbed = createEmbed({
            title: '🏦 NEW: Stock Market Heist',
            description: 'Team up with a partner and rob the **Stock Market Vault**!',
            color: 'economy',
            fields: [
                {
                    name: '😈 How it works',
                    value:
                        '1️⃣ Run **`/heist start @partner`** to invite a partner in crime\n' +
                        '2️⃣ They have **60 seconds** to hit "I\'m in 😈"\n' +
                        '3️⃣ 🎲 **30% chance** you crack the vault together',
                    inline: false,
                },
                {
                    name: '💰 If you win',
                    value:
                        'You split the loot **50/50** — and the score scales with the live market, so a booming market means bigger heists!\n\n' +
                        '📉 A successful heist shakes investor confidence: **every stock drops 5–10%**. Perfect time for everyone else to buy the dip with `/invest buy`!',
                    inline: false,
                },
                {
                    name: '🚔 If you get caught',
                    value:
                        'Both of you go to **jail for 5 minutes**.\n\n' +
                        '💸 Pay your fine (the loot you tried to steal) with **`/heist bail`** to walk free early — or sit out your time.\n\n' +
                        '🔓 Friends can still try `/jailbreak` to spring you out!',
                    inline: false,
                },
            ],
            footer: { text: '⏱️ 15 minute cooldown between heists' },
        });

        // ---------------------------------------------------------------
        // 3) SERVER EXCHANGE
        // ---------------------------------------------------------------
        const srvxEmbed = createEmbed({
            title: '📊 NEW: Server Exchange (SRVX)',
            description:
                'A brand-new stock powered by **YOU**.\n\n' +
                'SRVX **rises when the server is active** and **falls when chat goes quiet** — checked every 15 minutes.',
            color: 'economy',
            fields: [
                { name: '🔥 Buzzing chat (200+ msgs)', value: '**+6%** per tick 📈', inline: true },
                { name: '💬 Active chat (50–199 msgs)', value: '**+2.5% to +4%** per tick', inline: true },
                { name: '💀 Dead chat (0 msgs)', value: '**−3.5%** per tick 📉', inline: true },
                {
                    name: '💡 The play',
                    value: 'Buy shares with `/invest buy`, then keep the conversation alive to pump your own bag. Your portfolio literally depends on the server staying active! 👻',
                    inline: false,
                },
            ],
        });

        // ---------------------------------------------------------------
        // 4) PRICE REBALANCE
        // ---------------------------------------------------------------
        const pricesEmbed = createEmbed({
            title: '💹 Stock Price Rebalance',
            description: 'All stocks got a big boost — same market feel, chunkier numbers.',
            color: 'economy',
            fields: [
                { name: '👻 Ghost Corp (GHST)', value: '$100 → **$450**', inline: true },
                { name: '🏙️ Town Holdings (TOWN)', value: '$250 → **$1,200**', inline: true },
                { name: '🚀 MoonShot (MOON)', value: '$40 → **$150**', inline: true },
                { name: '🥇 Golden Reserve (GOLD)', value: '$500 → **$2,500**', inline: true },
                { name: '🪙 CryptoCoin (CRYP)', value: '$20 → **$85**', inline: true },
                { name: '🌾 Farmland (FARM)', value: '$80 → **$350**', inline: true },
                { name: '📊 Server Exchange (SRVX)', value: 'NEW at **$1,000**', inline: true },
            ],
            footer: { text: '📈 Prices update every 15 minutes — check /invest market' },
        });

        // ---------------------------------------------------------------
        // 5) BALANCE CHANGES
        // ---------------------------------------------------------------
        const balanceEmbed = createEmbed({
            title: '⚖️ Balance Changes',
            color: 'economy',
            fields: [
                {
                    name: '🏦 Heist payouts',
                    value: 'Tuned to the new market prices — roughly **$3.5k–$9k per heist**, split between partners.',
                    inline: false,
                },
                {
                    name: '🚔 Jail',
                    value: 'Jail from a failed heist blocks `/crime` too — and yes, `/jailbreak` works on heisted prisoners. 🔓',
                    inline: false,
                },
            ],
            footer: { text: '🍀 Good luck out there, ghosts! 👻' },
        });

        await targetChannel.send({
            content: pingRole ? pingRole.toString() : undefined,
            embeds: [headerEmbed, heistEmbed, srvxEmbed, pricesEmbed, balanceEmbed],
        });

        await InteractionHelper.safeEditReply(interaction, {
            content: `✅ Posted the bot update announcement to ${targetChannel.toString()}.`,
        });
    }, { command: 'bot-update' })
};
