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
    const escalateRoleIds = ticketPanel.escalationRoleIds.filter(
      (rid) => !ticketRolePerms.includes(rid) // Don't include initial permissions
    );

    // Check is valid - Escalation roles can be same as ticketRolePerms
    if (!escalateRoleIds) {
      interaction.editReply(`${ emojis.error } ${ member }, this ticket can't be escalated, configured escalation role(s) are already included in action role permissions - this action has been cancelled`);
      return;
    }

    // Declarations
    const currEscalationLevel = ticket.escalationLevel ?? 0;
    const currEscalationRoleId = escalateRoleIds.at(Math.max(currEscalationLevel - 1, 0));
    const nextEscalationRoleId = escalateRoleIds.at(currEscalationLevel);

    // First, check is valid range
    if (currEscalationLevel >= escalateRoleIds.length) {
      interaction.editReply(`${ emojis.error } ${ member }, this ticket can't be further escalated, it's at the highest level - this action has been cancelled`);
      return;
    }

    // Check if is claimedBy user if initial escalation
    if (currEscalationLevel === 0 && member.user.id !== ticket.claimedBy) {
      interaction.editReply(`${ emojis.error } ${ member }, only the ticket claimer (<@${ ticket.claimedBy }>) can initialize the ticket escalation process - this action has been cancelled`);
      return;
    }

    // Check if invoker has current escalation role
    if (
      currEscalationLevel !== 0
      && !member._roles.includes(currEscalationRoleId)
    ) {
      interaction.editReply(`${ emojis.error } ${ member }, only members of the current ticket escalation level (<@&${ currEscalationRoleId }>) can elevate it further - this action has been cancelled`);
      return;
    }

    // Ok, continue

    // First, if initial, unclaim ticket
    // Note: We can't reliably use #set, with add role/user permissions to unclaim,
    // Instead, escalate gradually and keep people that previously interacted in channel

    // Add permissions
    try {
      await channel.permissionOverwrites.create(nextEscalationRoleId, {
        'ViewChannel': true,
        'SendMessages': true,
        'EmbedLinks': true,
        'AttachFiles': true,
        'ReadMessageHistory': true
      });
      ticket.escalationLevel++;
      ticket.markModified('escalationLevel');
      await ticket.save();
    }
    catch (err) {
      interaction.editReply({
        content: `${ emojis.error } ${ member }, couldn't add escalation role <@&${ nextEscalationRoleId }> to ticket: ${ err.message }`,
        disableMentions: true
      });
      return;
    }

    // Note: Don't disable mentions - this is their notification
    interaction.editReply(`${ emojis.success } ${ member }, added <@&${ nextEscalationRoleId }> to the ticket`);

    // Try to send notification message
    channel.send(`<@&${ nextEscalationRoleId }>, this ticket has been escalated by <@${ member.id }>, please review ticket information`).catch(() => { /* void */ });

    // Identify escalated tickets in name
    channel.setName(`⬆️${ channel.name }`)
      .catch(() => { /* Void */ });

    // Ticket logging
    ticketLog({
      ticket,
      action,
      ticketPanel,
      actionEmoji: '⬆️',
      actionText: 'Escalated',
      guild,
      member,
      fields: [
        {
          name: '🌐 Escalated To',
          value: `<@&${ nextEscalationRoleId }>`,
          inline: true
        },
        {
          name: '🎚️ Escalation Level',
          value: `${ currEscalationLevel + 1 } / ${ escalateRoleIds.length }`,
          inline: true
        }
      ]
    });
  }
});

