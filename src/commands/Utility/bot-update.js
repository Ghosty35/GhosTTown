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
            title: '📢👻 BOT UPDATE — Economy Mega Boost & Stock Market Overhaul',
            description:
                'HUGE drop today, ghosts! 🎉\n\n' +
                'A brand-new **🏦 Stock Market Heist**, a stock powered by **your chat activity**, ' +
                'and a **💰 massive boost to EVERY way of earning** — work, jobs, casino, chatting, stocks, all of it.\n\n' +
                'Get earning, get trading, get heisting — it has never paid better. 👀',
            color: 'economy',
        });

        // ---------------------------------------------------------------
        // 1b) EARNINGS MEGA BOOST
        // ---------------------------------------------------------------
        const earningsEmbed = createEmbed({
            title: '💰 EARNINGS MEGA BOOST',
            description: 'Every income source just got a serious raise:',
            color: 'economy',
            fields: [
                { name: '🛠️ /work', value: '$750–4k → **$2k–10k**', inline: true },
                { name: '🎣 /fish', value: '$500–2k → **$1.5k–6k**', inline: true },
                { name: '⛏️ /mine', value: '$600–2.2k → **$1.8k–6.5k**', inline: true },
                { name: '🙏 /beg', value: '$100–1k → **$300–3k**', inline: true },
                { name: '🎁 /daily', value: '$15k → **$40k**', inline: true },
                { name: '🕵️ /crime', value: 'All payouts **×3** (up to $85k!)', inline: true },
                { name: '💼 Jobs', value: 'All weekly pay **×3** — top jobs now pay up to **$330k/week**!', inline: true },
                { name: '💬 Chatting', value: '$1–5 → **$10–50** per message', inline: true },
                { name: '🦹 /rob', value: 'Success chance **5% → 25%**, steal **10%** of wallets', inline: true },
                {
                    name: '🎰 Casino got juicier too',
                    value:
                        '• Slots jackpot: 50x → **100x** your bet (all multipliers raised!)\n' +
                        '• Blackjack: natural pays 2.5x → **3x**\n' +
                        '• Gamble: win chance 50% → **55%**, payout 2x → **2.2x**',
                    inline: false,
                },
            ],
            footer: { text: '💸 Time to get rich, ghosts!' },
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
                { name: '🔥 Buzzing chat (200+ msgs)', value: '**+8%** per tick 📈', inline: true },
                { name: '💬 Active chat (50–199 msgs)', value: '**+3% to +5%** per tick', inline: true },
                { name: '💀 Dead chat (0 msgs)', value: '**−4%** per tick 📉', inline: true },
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
            description: 'All stocks got a huge boost — and the market now has an **upward drift**, so holding shares is profitable on average. 📈',
            color: 'economy',
            fields: [
                { name: '👻 Ghost Corp (GHST)', value: 'now **$1,500** base', inline: true },
                { name: '🏙️ Town Holdings (TOWN)', value: 'now **$4,000** base', inline: true },
                { name: '🕶️ MandoCorp.co (MOON)', value: 'REBRANDED! now **$600** base', inline: true },
                { name: '🥇 Golden Reserve (GOLD)', value: 'now **$8,000** base', inline: true },
                { name: '🪙 CryptoCoin (CRYP)', value: 'now **$350** base — ±35% swings!', inline: true },
                { name: '🌿 WeedFarms.co (FARM)', value: 'REBRANDED! now **$1,200** base', inline: true },
                { name: '📊 Server Exchange (SRVX)', value: 'now **$3,500** base, up to **+10%/tick** when chat pops', inline: true },
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
                    value: 'Tuned to the new market prices — scales with the market — bigger index, bigger scores, split between partners.',
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
            embeds: [headerEmbed, earningsEmbed, heistEmbed, srvxEmbed, pricesEmbed, balanceEmbed],
        });

        await InteractionHelper.safeEditReply(interaction, {
            content: `✅ Posted the bot update announcement to ${targetChannel.toString()}.`,
        });
    }, { command: 'bot-update' })
};
