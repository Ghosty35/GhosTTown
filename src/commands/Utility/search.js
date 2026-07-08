import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { ResponseCoordinator } from '../../utils/responseCoordinator.js';

const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_ENGINE_ID;

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search the web, YouTube, maps, game news, and more')
        .addSubcommand(sub =>
            sub.setName('google')
                .setDescription('Search on Google')
                .addStringOption(opt => opt.setName('query').setDescription('What to search').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('youtube')
                .setDescription('Search for music/videos on YouTube')
                .addStringOption(opt => opt.setName('query').setDescription('Song or video name').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('maps')
                .setDescription('Get route directions')
                .addStringOption(opt => opt.setName('from').setDescription('Starting location').setRequired(true))
                .addStringOption(opt => opt.setName('to').setDescription('Destination').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('gamenews')
                .setDescription('Get latest gaming news')
                .addStringOption(opt => opt.setName('game').setDescription('Specific game or general').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('wiki')
                .setDescription('Quick Wikipedia lookup')
                .addStringOption(opt => opt.setName('query').setDescription('What to look up').setRequired(true))
        ),

    category: 'Utility',

    // Prefix support
    async executePrefix(message, args, client) {
        const coordinator = ResponseCoordinator.attach(null, { message });
        const subcommand = args[0]?.toLowerCase();
        const query = args.slice(1).join(' ');

        if (!subcommand || !query) {
            return coordinator.respondUsage('!search <google|youtube|maps|gamenews|wiki> <query>');
        }

        await message.channel.sendTyping();

        try {
            switch (subcommand) {
                case 'google':
                    await handleGoogleSearch(message, query, coordinator);
                    break;
                case 'youtube':
                    await handleYouTubeSearch(message, query, coordinator);
                    break;
                case 'maps':
                    await handleMapsPrefix(message, args, coordinator);
                    break;
                case 'gamenews':
                    await handleGameNews(message, query || 'gaming', coordinator);
                    break;
                case 'wiki':
                    await handleWikipedia(message, query, coordinator);
                    break;
                default:
                    return coordinator.respondUsage('!search <google|youtube|maps|gamenews|wiki> <query>');
            }
        } catch (error) {
            logger.error('Prefix search error:', error);
            await coordinator.respond({ content: '❌ Search failed. Try again.' });
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply();

        try {
            switch (subcommand) {
                case 'google': await handleGoogleSearch(interaction); break;
                case 'youtube': await handleYouTubeSearch(interaction); break;
                case 'maps': await handleMaps(interaction); break;
                case 'gamenews': await handleGameNews(interaction); break;
                case 'wiki': await handleWikipedia(interaction); break;
            }
        } catch (error) {
            logger.error('Search command error:', error);
            await interaction.editReply({ content: '❌ Search failed.', ephemeral: true });
        }
    }
};

// ==================== Handlers (Shared) ====================

async function handleGoogleSearch(ctx, query = null, coordinator = null) {
    const q = query || ctx.options.getString('query');
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(q)}`;

    const { data } = await axios.get(url);
    const embed = new EmbedBuilder()
        .setTitle(`🔍 Google: ${q}`)
        .setColor(0x4285F4)
        .setTimestamp();

    if (data.items?.length) {
        data.items.slice(0, 5).forEach((item, i) => {
            embed.addFields({
                name: `${i + 1}. ${item.title}`,
                value: `[Open](${item.link})\n${item.snippet?.slice(0, 120)}...`,
            });
        });
    } else {
        embed.setDescription('No results found.');
    }

    if (coordinator) return coordinator.respond({ embeds: [embed] });
    return ctx.editReply({ embeds: [embed] });
}

async function handleYouTubeSearch(ctx, query = null, coordinator = null) {
    const q = query || ctx.options.getString('query');
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

    const embed = new EmbedBuilder()
        .setTitle(`🎵 YouTube: ${q}`)
        .setDescription(`[Search on YouTube](${searchUrl})`)
        .setColor(0xFF0000)
        .setFooter({ text: 'Tip: Use /play for direct music playback!' });

    if (coordinator) return coordinator.respond({ embeds: [embed] });
    return ctx.editReply({ embeds: [embed] });
}

async function handleMaps(ctx, coordinator = null) {
    const from = ctx.options?.getString('from') || ctx.args?.[1];
    const to = ctx.options?.getString('to') || ctx.args?.slice(2).join(' ');

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`;

    const embed = new EmbedBuilder()
        .setTitle('🗺️ Directions')
        .setDescription(`**From:** ${from}\n**To:** ${to}`)
        .setColor(0x34A853)
        .addFields({ name: 'Google Maps', value: `[Get Route](${mapsUrl})` });

    if (coordinator) return coordinator.respond({ embeds: [embed] });
    return ctx.editReply({ embeds: [embed] });
}

async function handleMapsPrefix(message, args, coordinator) {
    if (args.length < 3) {
        return coordinator.respondUsage('!search maps <from> <to>');
    }
    const from = args[1];
    const to = args.slice(2).join(' ');
    return handleMaps({ args: [null, from, to] }, coordinator);
}

async function handleGameNews(ctx, game = 'gaming', coordinator = null) {
    const { data } = await axios.get('https://www.gamerpower.com/api/giveaways?type=game');

    const embed = new EmbedBuilder()
        .setTitle('📰 Gaming News / Free Games')
        .setColor(0x00FF00);

    data.slice(0, 6).forEach(item => {
        embed.addFields({
            name: item.title,
            value: `[Claim](${item.open_giveaway}) • ${item.platforms}`,
            inline: false
        });
    });

    if (coordinator) return coordinator.respond({ embeds: [embed] });
    return ctx.editReply({ embeds: [embed] });
}

async function handleWikipedia(ctx, query = null, coordinator = null) {
    const q = query || ctx.options.getString('query');
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;

    const { data } = await axios.get(url);

    const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setDescription(data.extract?.slice(0, 500) + '...')
        .setURL(data.content_urls?.desktop?.page)
        .setColor(0x000000);

    if (coordinator) return coordinator.respond({ embeds: [embed] });
    return ctx.editReply({ embeds: [embed] });
}
