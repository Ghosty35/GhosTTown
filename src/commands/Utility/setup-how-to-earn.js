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
        )
        .addChannelOption((option) =>
            option
                .setName('dashboard_channel')
                .setDescription('Your designated Dashboard channel, so the guide can link to it')
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
        const dashboardChannel = interaction.options.getChannel('dashboard_channel');

        // ---------------------------------------------------------------
        // 1) INTRO
        // ---------------------------------------------------------------
        const introEmbed = createEmbed({
            title: '👻🏦 Welcome to Ghost Savings and Loans',
            description:
                '💀 This server runs on **👻🪙 GhostCoins**.\n\n' +
                'Earn them, grow them, and spend them in the shop for perks like name colors, VIP access, and job licenses.\n\n' +
                '🏧 All your banking — cash, savings, and crypto — lives in one place: run `/atm` anytime.\n\n' +
                '📖 **Jump to:** 💪 Earning • 🏧 The ATM • 💼 Jobs • 🎲 Games • 📊 Track Your Progress • 📌 Rules',
            color: 'economy',
        });

        // ---------------------------------------------------------------
        // 2) STEADY & PASSIVE INCOME
        // ---------------------------------------------------------------
        const steadyIncomeEmbed = createEmbed({
            title: '💪 Steady & Passive Income',
            description: '⚡ Reliable ways to fill up your wallet, day to day.',
            color: 'economy',
            fields: [
                { name: '🛠️ /work', value: '👻🪙 $750 – $4,000\n⏳ 3 min cooldown', inline: true },
                { name: '🙏 /beg', value: '👻🪙 $100 – $1,000\n⏳ 3 min cooldown', inline: true },
                { name: '🎣 /fish', value: '👻🪙 $500 – $2,000\n🎣 1.5x with a Fishing Rod\n⏳ 3 min cooldown', inline: true },
                { name: '⛏️ /mine', value: '👻🪙 $600 – $2,200\n⛏️ 1.2x Pickaxe • 💎 2x Diamond\n⏳ 3 min cooldown', inline: true },
                { name: '🕵️ /crime', value: '👻🪙 Variable payout\n⚠️ Risk of a fine if caught\n⏳ 2 min cooldown', inline: true },
                { name: '🎁 /daily', value: '👻🪙 $15,000 flat\n📅 Once every 24 hours', inline: true },
                {
                    name: '💬 Just chat!',
                    value: '👻🪙 $1 – $5 per message, once per minute.\n\nWorks in any channel — no command needed. Ghosts love a good conversation. 👻',
                    inline: false,
                },
            ],
        });

        // ---------------------------------------------------------------
        // 3) THE ATM
        // ---------------------------------------------------------------
        const atmEmbed = createEmbed({
            title: '🏧👻 Managing Your Money — The ATM',
            description:
                '🔐 Run `/atm` to open your account.\n\n' +
                'First time, you\'ll set a **4-digit PIN** — you\'ll need it every time after that. No peeking, ghosts! 👻',
            color: 'economy',
            fields: [
                {
                    name: '📊 One screen, everything you own',
                    value: 'Your 👛 **Cash**, 🏦 **Bank**, and 📈 **Crypto** balances — plus your total 💰 Net Worth.',
                    inline: false,
                },
                {
                    name: '⬆️ Deposit All  •  ⬇️ Withdraw All',
                    value: 'Instantly move everything between your 👛 wallet and 🏦 Ghost Savings and Loans.',
                    inline: false,
                },
                {
                    name: '✏️ Custom Amount',
                    value: 'Pick a direction, type a number — move exactly what you want.',
                    inline: false,
                },
                {
                    name: '📈 Buy Crypto  •  📉 Sell Crypto',
                    value: 'Trade shares on the GhostCoin market right from the ATM (same market as `/invest`).',
                    inline: false,
                },
                {
                    name: '🔒 Why bother with the bank?',
                    value: '💸 Cash in your wallet can be stolen by `/rob`.\n\nMoney in 🏦 Ghost Savings and Loans **cannot** — it\'s ghost-proof! 👻',
                    inline: false,
                },
            ],
            footer: { text: '🔑 Forgot your PIN? Ask staff — accounts can be reset.' },
        });

        // ---------------------------------------------------------------
        // 4) JOBS & CAREERS
        // ---------------------------------------------------------------
        const jobsEmbed = createEmbed({
            title: '💼👻 Jobs & Careers',
            description:
                'Want serious weekly income? Get a job.\n\n' +
                '1️⃣ Check `/job list` to see every job and its pay\n' +
                '2️⃣ Buy the matching **license** in `/shop browse`\n' +
                '3️⃣ Run `/job apply` to start working\n' +
                '4️⃣ Get paid automatically, every 7 days\n\n' +
                'Changed your mind? `/job apply` to switch anytime, or `/job quit` to walk away. Check `/job status` to see your countdown to payday.',
            color: 'economy',
            fields: [
                { name: '🏦 Bank Manager', value: '$60,000 – $90,000 / week', inline: true },
                { name: '💻 Hacker', value: '$70,000 – $110,000 / week', inline: true },
                { name: '🎭 Scammer', value: '$45,000 – $80,000 / week', inline: true },
                { name: '🔧 Car Mechanic', value: '$40,000 – $65,000 / week', inline: true },
                { name: '👨‍🍳 Chef', value: '$35,000 – $55,000 / week', inline: true },
                { name: '🚚 Delivery Driver', value: '$30,000 – $50,000 / week', inline: true },
            ],
            footer: { text: '💼 Employed members get a "Currently Working" role — unemployed ghosts stay "Jobless" 👻' },
        });

        // ---------------------------------------------------------------
        // 5) RISK & REWARD GAMES
        // ---------------------------------------------------------------
        const gamesEmbed = createEmbed({
            title: '🎲👻 Risk & Reward Games',
            description:
                '🎰 Higher risk, higher reward.\n\n' +
                'Only bet what you can afford to lose to the spirits.\n\n' +
                '🚔 Get caught committing a crime and you\'ll land in **jail**. Stuck? A friend can try `/jailbreak` to spring you — 50/50 odds. If they fail, they\'re joining you in there.',
            color: 'economy',
            fields: [
                { name: '🎰 /casino slots', value: 'Match 3 reels for up to 💎 50x your bet', inline: true },
                { name: '🃏 /casino blackjack', value: 'Beat the dealer — blackjack pays 2.5x', inline: true },
                { name: '🪙 /casino coinflip', value: 'Challenge a member — winner takes both wagers', inline: true },
                { name: '🎲 /casino gamble', value: '~50% win chance, 2x payout • boosted by 🍀 Lucky items', inline: true },
                { name: '🦹 /rob', value: 'Low success chance, small % of a wallet • ⏳ 4 hr cooldown', inline: true },
                { name: '📈 /invest', value: 'Buy/sell shares on the fluctuating GhostCoin market', inline: true },
            ],
        });

        // ---------------------------------------------------------------
        // 6) RULES
        // ---------------------------------------------------------------
        const dashboardChannelText = dashboardChannel
            ? `Head to ${dashboardChannel.toString()} and run \`/stats dashboard\` once.`
            : 'Run `/stats dashboard` in this server\'s designated Dashboard channel.';

        const progressEmbed = createEmbed({
            title: '📊👻 Track Your Progress',
            description: 'Everything you need to check where you stand — some of it updates itself, no command required.',
            color: 'economy',
            fields: [
                {
                    name: '📊 /stats dashboard — Your Live Stats Card',
                    value:
                        `${dashboardChannelText}\n\n` +
                        'It posts a personal card showing your 💰 balances, 💼 job, 🎮 today\'s game results, and every ⏱️ cooldown at a glance.\n\n' +
                        'That card **updates itself automatically** every 30 seconds — just open the channel anytime and it\'s already current. No need to run the command again.',
                    inline: false,
                },
                {
                    name: '📈 /stats earnings',
                    value: 'Full breakdown of every income source — hourly, daily, and weekly rates for jobs, plus every command\'s payout range.',
                    inline: false,
                },
                {
                    name: '⏱️ /stats cooldowns',
                    value: 'A quick one-off cooldown check from anywhere, if you don\'t want to wait for your dashboard to refresh.',
                    inline: false,
                },
                {
                    name: '🎮 /stats games',
                    value: 'Your win/loss total for today across slots, blackjack, gamble, coinflip, and rob.',
                    inline: false,
                },
            ],
        });

        const rulesEmbed = createEmbed({
            title: '📌⚖️ Rules & Channel Etiquette',
            color: 'economy',
            fields: [
                {
                    name: '✅ Do',
                    value:
                        '🎯 Use economy commands in the designated bot channels\n\n' +
                        '⏳ Respect command cooldowns — spamming won\'t make them shorter\n\n' +
                        '🏧 Use `/atm` to move spare cash into 🏦 Ghost Savings and Loans\n\n' +
                        '🔑 Set a PIN you\'ll actually remember\n\n' +
                        '💼 Get a job for reliable weekly income\n\n' +
                        '📊 Set up `/stats dashboard` once — don\'t spam it, you only get one live card at a time\n\n' +
                        '🐛 Report bugs to staff instead of using them',
                    inline: false,
                },
                {
                    name: '❌ Don\'t',
                    value:
                        '🚫 Don\'t use economy commands outside the bot channels\n\n' +
                        '👥 Don\'t use alt accounts to farm coins\n\n' +
                        '🐛 Don\'t exploit bugs for unfair gains\n\n' +
                        '😤 Don\'t harass members after a bet — it\'s just 👻🪙 GhostCoins',
                    inline: false,
                },
            ],
            footer: { text: '🍀 Have fun, and good luck out there, ghosts! 👻' },
        });

        await targetChannel.send({
            embeds: [introEmbed, steadyIncomeEmbed, atmEmbed, jobsEmbed, gamesEmbed, progressEmbed, rulesEmbed],
        });

        await InteractionHelper.safeEditReply(interaction, {
            content: `✅ Posted the earning guide to ${targetChannel.toString()}.`,
        });
    }, { command: 'setup-how-to-earn' })
};
