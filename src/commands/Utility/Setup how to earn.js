import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-how-to-earn')
        .setDescription('(Admin) Post a formatted GhostCoins earning guide to a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Channel to post the guide in (defaults to this channel)')
                .addChannelTypes(ChannelType.GuildText)
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

        const introEmbed = createEmbed({
            title: '👻🏦 Welcome to Ghost Savings and Loans',
            description:
                '💀 This server haunts on **👻🪙 GhostCoins** — earn \'em, grow \'em, and spend \'em in the shop for perks like spooky name colors and VIP access.\n\n' +
                '🏧 All your banking — cash, savings, and crypto — lives in one place: run `/atm` anytime to check your balances and manage your money.\n\n' +
                '📖 Below is everything you need to know: how to earn, how the ATM works, and the house rules.',
            color: 'economy',
        });

        const steadyIncomeEmbed = createEmbed({
            title: '💪 Steady & Passive Income',
            description: '⚡ Reliable ways to fill up your ghostly wallet over time.',
            color: 'economy',
            fields: [
                { name: '🛠️ /work', value: '👻🪙 $100 – $2,500 • ⏳ 3 min cooldown', inline: true },
                { name: '🙏 /beg', value: '👻🪙 $10 – $500 • ⏳ 3 min cooldown', inline: true },
                { name: '🎣 /fish', value: '👻🪙 $300 – $1,500 base (🎣 1.5x with a Fishing Rod) • ⏳ 3 min cooldown', inline: true },
                { name: '⛏️ /mine', value: '👻🪙 $400 – $1,500 base (⛏️ 1.2x Pickaxe, 💎 2x Diamond Pickaxe) • ⏳ 3 min cooldown', inline: true },
                { name: '🕵️ /crime', value: '👻🪙 Variable payout, risk of a fine if caught • ⏳ 2 min cooldown', inline: true },
                { name: '🎁 /daily', value: '👻🪙 $1,000 flat • 📅 once every 24 hours', inline: true },
                { name: '💬 Just chat!', value: '👻🪙 $1 – $5 per message, once per minute — works in any channel, no command needed. Ghosts love a good conversation. 👻', inline: false },
            ],
        });

        const atmEmbed = createEmbed({
            title: '🏧👻 Managing Your Money — The ATM',
            description:
                '🔐 Run `/atm` to open your account. First time you\'ll set a **4-digit PIN** — you\'ll need it every time after that to get in. No peeking, ghosts! 👻',
            color: 'economy',
            fields: [
                {
                    name: '📊 What you\'ll see',
                    value: 'One screen with your 👛 **Cash**, 🏦 **Bank**, and 📈 **Crypto** balances, plus your total 💰 Net Worth.',
                    inline: false,
                },
                {
                    name: '⬆️ Deposit All / ⬇️ Withdraw All',
                    value: 'Instantly move everything between your 👛 wallet and 🏦 Ghost Savings and Loans.',
                    inline: false,
                },
                {
                    name: '✏️ Custom Amount',
                    value: 'Move a specific amount — pick ⬆️ Deposit or ⬇️ Withdraw and type the number.',
                    inline: false,
                },
                {
                    name: '📈 Buy Crypto / 📉 Sell Crypto',
                    value: 'Trade shares on the 👻 GhostCoin market right from the ATM (same market as `/invest`).',
                    inline: false,
                },
                {
                    name: '🔒 Why bother with the bank?',
                    value: '💸 Cash in your wallet can be stolen by `/rob`. Money in 🏦 Ghost Savings and Loans **cannot** — it\'s ghost-proof! 👻',
                    inline: false,
                },
            ],
            footer: { text: '🔑 Forgot your PIN? Ask staff — accounts can be reset.' },
        });

        const gamesEmbed = createEmbed({
            title: '🎲👻 Risk & Reward Games',
            description: '🎰 Higher risk, higher reward — only bet what you can afford to lose to the spirits.',
            color: 'economy',
            fields: [
                { name: '🎰 /slots', value: 'Match 3 reels for up to 💎 50x your bet', inline: true },
                { name: '🃏 /blackjack', value: 'Beat the dealer — blackjack pays 2.5x 🂡', inline: true },
                { name: '🪙 /coinflip', value: 'Challenge another member — winner takes both wagers 👻', inline: true },
                { name: '🎲 /gamble', value: '~50% win chance, 2x payout • boosted by 🍀 Lucky Clover/Charm', inline: true },
                { name: '🦹 /rob', value: 'Low success chance, steals a small % of a wallet • ⏳ 4 hr cooldown', inline: true },
                { name: '📈 /invest', value: 'Buy/sell shares in the fluctuating 👻🪙 GhostCoin market', inline: true },
            ],
        });

        const rulesEmbed = createEmbed({
            title: '📌⚖️ Rules & Channel Etiquette',
            color: 'economy',
            fields: [
                {
                    name: '✅ Do',
                    value:
                        '🎯 Use economy commands in the designated bot channels\n' +
                        '⏳ Respect command cooldowns — spamming won\'t make them shorter\n' +
                        '🏧 Use `/atm` to move spare cash into 🏦 Ghost Savings and Loans — it\'s the only place your 👻🪙 GhostCoins are safe from `/rob`\n' +
                        '🔑 Set an ATM PIN you\'ll actually remember (staff can reset it, but it\'s a hassle)\n' +
                        '🛍️ Check `/shop` for ways to spend your coins\n' +
                        '🐛 Report bugs or exploits to staff instead of using them',
                    inline: false,
                },
                {
                    name: '❌ Don\'t',
                    value:
                        '🚫 Don\'t use economy commands outside the bot channels\n' +
                        '👥 Don\'t use alt accounts to farm coins\n' +
                        '🐛 Don\'t exploit bugs for unfair coin gains\n' +
                        '😤 Don\'t harass members after winning or losing a bet — it\'s just 👻🪙 GhostCoins',
                    inline: false,
                },
            ],
            footer: { text: '🍀 Have fun, and good luck out there, ghosts! 👻' },
        });

        await targetChannel.send({ embeds: [introEmbed, steadyIncomeEmbed, atmEmbed, gamesEmbed, rulesEmbed] });

        await InteractionHelper.safeEditReply(interaction, {
            content: `✅ Posted the earning guide to ${targetChannel.toString()}.`,
        });
    }, { command: 'setup-how-to-earn' })
};
