import { MessageFlags } from 'discord.js';
import { hasDangerousPermissions } from '../../services/reactionRoleService.js';
import { logger } from '../../utils/logger.js';

// Handles every button with customId `selfrole:<roleId>` — posted by the
// /reactionroles create panels. Toggles the role: press to claim it,
// press again to remove it. Works forever, including after bot restarts,
// because the role ID lives inside the button itself.
export default {
    name: 'selfrole',

    async execute(interaction, client, args) {
        const [roleId] = args;

        const role = interaction.guild.roles.cache.get(roleId) ||
            (await interaction.guild.roles.fetch(roleId).catch(() => null));

        if (!role) {
            return interaction.reply({
                content: '❌ That role no longer exists — ask an admin to rebuild this panel with `/reactionroles create`.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Safety re-check at click time: role setups can change after the
        // panel was posted, so never trust the panel alone.
        if (role.managed || hasDangerousPermissions(role)) {
            return interaction.reply({
                content: '❌ This role can no longer be self-assigned for safety reasons.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const me = interaction.guild.members.me;
        if (me && role.position >= me.roles.highest.position) {
            return interaction.reply({
                content: '❌ I can\'t manage this role anymore — it was moved above my highest role. Ask an admin to fix the role order.',
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const member = interaction.member;
            const hasRole = member.roles.cache.has(role.id);

            if (hasRole) {
                await member.roles.remove(role, 'Self-role panel: removed by user');
                return interaction.reply({
                    content: `➖ Removed ${role.toString()} — tap again anytime to get it back.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            await member.roles.add(role, 'Self-role panel: claimed by user');
            return interaction.reply({
                content: `✅ You now have the ${role.toString()} role! Tap the button again to remove it.`,
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error(`Self-role toggle failed for role ${roleId}:`, error);
            return interaction.reply({
                content: '❌ Something went wrong assigning that role. Make sure I have **Manage Roles** permission.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => null);
        }
    },
};
