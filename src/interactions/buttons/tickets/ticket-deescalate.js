/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonarjs/no-all-duplicated-branches */
const { ComponentCommand } = require('../../../classes/Commands');
const { PermissionFlagsBits } = require('discord.js');
const { TicketModel } = require('../../../mongo/Ticket');
const ticketPanels = require('../../../../config/tickets');
const { ticketLog } = require('../../../modules/ticket-logging');
const { resolveOverridableConfigKey } = require('../../../modules/ticket-config');

// eslint-disable-next-line sonarjs/cognitive-complexity
module.exports = new ComponentCommand({
  clientPerms: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ManageMessages
  ],
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    // Destructure from interaction and client
    const {
      member, channel, customId, guild
    } = interaction;
    const { emojis } = client.container;
    const [
      , // @
      , // action
      ticketId
    ] = customId.split('@');

    // Defer a reply to the interaction
    await interaction.deferReply({ ephemeral: true });

    // Fetch ticket
    const ticket = await TicketModel.findOne({ _id: ticketId });
    if (!ticket) {
      interaction.editReply(`${ emojis.error } ${ member }, can't fetch ticket data - please try again later`);
      return;
    }


    const ticketPanel = ticketPanels.at(ticket.panelIndex);
    if (!ticketPanel) {
      interaction.editReply(`${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Configuration for ticket panel no longer exists, please re-deploy the panel and clean/delete old deployment messages.`);
      return;
    }


    // Resolve action
    const { actions } = ticketPanel;
    const action = actions.at(ticket.actionIndex);
    if (!action) {
      interaction.editReply(`${ emojis.error } ${ member }, ticket action with index **\`${ ticket.actionIndex }\`** is not defined, you should probably re-deploy your ticket panel with \`/deploy-ticket-panel\`, please delete channel manually`);
      return;
    }

    // Should NOT be ticket user
    const ticketRolePerms = resolveOverridableConfigKey('_rolePermissions', {
      ticketPanel, action, serverIdentifier: ticket.serverIdentifier
    });
    if (ticket.userId === member.id && !member._roles.some((id) => ticketRolePerms.includes(id))) {
      interaction.editReply(`${ emojis.error } ${ member }, you don't have permission to claim this ticket`);
      return;
    }

    // Return if not already claimed
    if (!ticket.claimed) {
      interaction.editReply(`${ emojis.error } ${ member }, this ticket hasn't been claimed yet - this action has been cancelled`);
      return;
    }

    // Resolve current escalation level
    const escalateRoleIds = ticketPanel.escalationRoleIds;
    const currEscalationLevel = ticket.escalationLevel ?? 0;
    const currEscalationRoleId = escalateRoleIds.at(Math.max(currEscalationLevel - 1, 0));

    // First, check is valid range
    if (currEscalationLevel <= 0) {
      interaction.editReply(`${ emojis.error } ${ member }, this ticket can't be further de-escalated, it's at the lowest level - this action has been cancelled`);
      return;
    }

    // Check if invoker has current escalation role
    if (!member._roles.includes(currEscalationRoleId)) {
      interaction.editReply(`${ emojis.error } ${ member }, only members of the current ticket escalation level (<@&${ currEscalationRoleId }>) can de-escalate it - this action has been cancelled`);
      return;
    }

    // Ok, continue

    // Remove permissions
    try {
      await channel.permissionOverwrites.delete(currEscalationRoleId);
      ticket.escalationLevel--;
      ticket.markModified('escalationLevel');
      await ticket.save();
    }
    catch (err) {
      interaction.editReply({
        content: `${ emojis.error } ${ member }, couldn't remove escalation role <@&${ currEscalationRoleId }> from ticket: ${ err.message }`,
        disableMentions: true
      });
      return;
    }

    interaction.editReply(`${ emojis.success } ${ member }, removed <@&${ currEscalationRoleId }> from the ticket - level was de-escalated`);

    if (ticket.escalationLevel === 0) {
      // Identify cancel - Removes ⬆️ from start
      channel.setName(channel.name.replaceAll('⬆️', ''))
        .catch(() => { /* Void */ });
    }

    // Ticket logging
    ticketLog({
      ticket,
      action,
      ticketPanel,
      actionEmoji: '⬇️',
      actionText: 'De-escalated',
      guild,
      member,
      fields: [
        {
          name: '🌐 Escalation Role Removed',
          value: `<@&${ currEscalationRoleId }>`,
          inline: true
        },
        {
          name: '🎚️ Escalation Level',
          value: `${ currEscalationLevel - 1 } / ${ escalateRoleIds.length }`,
          inline: true
        }
      ]
    });
  }
});

