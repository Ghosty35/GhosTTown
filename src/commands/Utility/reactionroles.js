import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reactionroles')
        .setDescription('Manage self-assignable reaction roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a role selection panel in the current channel')
                .addStringOption(opt => opt.setName('title').setDescription('Panel title').setRequired(true))
        ),

    category: 'Utility',

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: 'You need **Manage Roles** permission.', ephemeral: true });
        }

        const title = interaction.options.getString('title');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription('Click the buttons below to get or remove roles.')
            .setColor(0x5865F2)
            .setFooter({ text: 'TitanBot • Self Roles' });

        // Example buttons - you can customize these
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('role:announcements')
                .setLabel('Announcements')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📢'),
            
            new ButtonBuilder()
                .setCustomId('role:games')
                .setLabel('Games')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎮'),
                
            new ButtonBuilder()
                .setCustomId('role:memes')
                .setLabel('Memes')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('😂')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('role:roast-pit')
                .setLabel('Roast Pit')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔥')
        );

        await interaction.reply({ 
            embeds: [embed], 
            components: [row1, row2] 
        });

        logger.info(`Reaction role panel created by ${interaction.user.tag}`);
    }
};