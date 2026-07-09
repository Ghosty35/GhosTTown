import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ChannelType,
} from 'discord.js';
import { hasDangerousPermissions } from '../../services/reactionRoleService.js';
import { logger } from '../../utils/logger.js';

const MAX_ROLES = 10; // two rows of five buttons

export default {
    category: 'Utility',

    data: (() => {
        const builder = new SlashCommandBuilder()
            .setName('reactionroles')
            .setDescription('Manage self-assignable role panels')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

        const sub = builder.addSubcommand((s) => {
            s.setName('create')
                .setDescription('Create a role selection panel')
                .addStringOption((opt) =>
                    opt.setName('title').setDescription('Panel title (e.g. "Pick Your Roles")').setRequired(true)
                )
                .addRoleOption((opt) =>
                    opt.setName('role1').setDescription('First selectable role').setRequired(true)
                );

            for (let i = 2; i <= MAX_ROLES; i++) {
                s.addRoleOption((opt) =>
                    opt.setName(`role${i}`).setDescription(`Selectable role #${i}`).setRequired(false)
                );
            }

            s.addStringOption((opt) =>
                opt
                    .setName('description')
                    .setDescription('Custom text shown at the top of the panel')
                    .setRequired(false)
            );
            s.addChannelOption((opt) =>
                opt
                    .setName('channel')
                    .setDescription('Channel to post the panel in (defaults to here)')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(false)
            );
            return s;
        });

        return sub;
    })(),

    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: '❌ You need **Manage Roles** permission.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        // Collect the chosen roles (deduplicated, in order)
        const roles = [];
        for (let i = 1; i <= MAX_ROLES; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role && !roles.some((r) => r.id === role.id)) roles.push(role);
        }

        // ── Safety checks ────────────────────────────────────────────
        const me = interaction.guild.members.me;
        const problems = [];
        for (const role of roles) {
            if (role.managed) problems.push(`• ${role.toString()} — managed by an integration/bot, can't be self-assigned.`);
            else if (role.id === interaction.guild.id) problems.push(`• @everyone can't be a selectable role.`);
            else if (hasDangerousPermissions(role)) problems.push(`• ${role.toString()} — has dangerous permissions (admin/moderation), refusing for safety.`);
            else if (me && role.position >= me.roles.highest.position) problems.push(`• ${role.toString()} — is above my highest role; move my role higher in Server Settings → Roles.`);
        }

        if (problems.length > 0) {
            return interaction.editReply({
                content: `⚠️ I can't use some of those roles:\n${problems.join('\n')}\n\nFix these and run the command again.`,
            });
        }

        // ── Build the panel (shop-list style) ────────────────────────
        const embed = new EmbedBuilder()
            .setTitle(`🎭  ${title}`)
            .setDescription(
                (description ? `${description}\n\n` : '') +
                    `**Available roles:**\n` +
                    roles.map((role) => `${role.unicodeEmoji || '🎭'}  ${role.toString()}`).join('\n') +
                    `\n\n🖱️ *Tap a button to claim a role — tap again to remove it.*`
            )
            .setColor(0x5865f2)
            .setFooter({ text: `${interaction.guild.name} • Self Roles — instant & reversible` });

        // Buttons: role name on the button, up to 5 per row
        const rows = [];
        for (let i = 0; i < roles.length; i += 5) {
            const row = new ActionRowBuilder();
            for (const role of roles.slice(i, i + 5)) {
                const btn = new ButtonBuilder()
                    .setCustomId(`selfrole:${role.id}`)
                    .setLabel(role.name.slice(0, 78))
                    .setStyle(ButtonStyle.Primary);
                if (role.unicodeEmoji) btn.setEmoji(role.unicodeEmoji);
                row.addComponents(btn);
            }
            rows.push(row);
        }

        await targetChannel.send({ embeds: [embed], components: rows });

        await interaction.editReply({
            content: `✅ Role panel posted in ${targetChannel.toString()} with ${roles.length} selectable role(s). The buttons keep working forever — even after bot restarts.`,
        });

        logger.info(`Self-role panel created by ${interaction.user.tag} in #${targetChannel.name} (${roles.length} roles)`);
    },
};
