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

    // Resolve panel
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

    // Return if already claimed
    if (ticket.claimed) {
      interaction.editReply(`${ emojis.error } ${ member }, this ticket was already claimed by <@${ ticket.claimedBy }> - ticket has to be unclaimed by them before it can be claimed again`);
      return;
    }

    // Ok, claim
    // Try to update permissions, claiming the ticket
    // try {
    //   await channel.permissionOverwrites.set([
    //     {
    //       id: guild.id,
    //       deny: [ PermissionsBitField.Flags.ViewChannel ]
    //     },
    //     {
    //       id: ticket.userId,
    //       allow: [
    //         PermissionsBitField.Flags.ViewChannel,
    //         PermissionsBitField.Flags.SendMessages,
    //         PermissionsBitField.Flags.EmbedLinks,
    //         PermissionsBitField.Flags.AttachFiles,
    //         PermissionsBitField.Flags.ReadMessageHistory
    //       ]
    //     },
    //     {
    //       id: member.id,
    //       allow: [
    //         PermissionsBitField.Flags.ViewChannel,
    //         PermissionsBitField.Flags.SendMessages,
    //         PermissionsBitField.Flags.EmbedLinks,
    //         PermissionsBitField.Flags.AttachFiles,
    //         PermissionsBitField.Flags.ReadMessageHistory
    //       ]
    //     }
    //   ]);
    // }
    // catch (err) {
    //   interaction.editReply({ content: `${ emojis.error } ${ member }, can't update ticket permissions (claim):\n\`\`\`${ err.message }\`\`\`` });
    //   return;
    // }

    // Update ticket claim info
    ticket.claimed = true;
    ticket.claimedBy = member.id;
    await ticket.save();

    // User feedback
    interaction.editReply(`${ emojis.success } ${ member }, you have claimed this ticket`);
    channel
      .send(`${ emojis.success } <@${ ticket.userId }>, ${ member } has claimed your ticket`)
      .catch(() => { /* void */ });

    // Identify claimed ticket in name
    channel.setName(`📍${ channel.name }`)
      .catch(() => { /* Void */ });

    // Ticket logging
    ticketLog({
      ticket,
      action,
      ticketPanel,
      actionEmoji: '📍',
      actionText: 'Claimed',
      guild,
      member
    });
  }
});

