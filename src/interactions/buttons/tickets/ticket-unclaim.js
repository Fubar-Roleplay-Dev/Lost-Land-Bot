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

    const ticketPanel = ticketPanels.at(ticket.panelIndex);
    if (!ticketPanel) {
      interaction.editReply(`${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Configuration for ticket panel no longer exists, please re-deploy the panel and clean/delete old deployment messages.`);
      return;
    }

    // Resolve action
    const { actions } = ticketPanel;
    const action = actions.at(ticket.actionIndex);
    if (!action) {
      interaction.editReply(`${ emojis.error } ${ member }, ticket action with index **\`${ ticket.actionIndex }\`** is not defined, you should re-deploy your ticket panel with \`/deploy-ticket-panel\`, please delete channel manually`);
      return;
    }

    // Should NOT be ticket user
    const ticketRolePerms = resolveOverridableConfigKey('_rolePermissions', {
      ticketPanel, action, serverIdentifier: ticket.serverIdentifier
    });
    if (ticket.userId === member.id && !member._roles.some((id) => ticketRolePerms.includes(id))) {
      interaction.editReply(`${ emojis.error } ${ member }, you don't have permission to unclaim this ticket`);
      return;
    }

    // Return if not claimed
    if (!ticket.claimed) {
      interaction.editReply(`${ emojis.error } ${ member }, this ticket hasn't been claimed yet - this action has been cancelled`);
      return;
    }


    // Ok, unclaim
    // Try to update permissions, unclaim/opening the ticket
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
    //     ...ticketRolePerms.map((id) => ({
    //       id,
    //       allow: [
    //         PermissionsBitField.Flags.ViewChannel,
    //         PermissionsBitField.Flags.SendMessages,
    //         PermissionsBitField.Flags.EmbedLinks,
    //         PermissionsBitField.Flags.AttachFiles,
    //         PermissionsBitField.Flags.ReadMessageHistory
    //       ]
    //     }))
    //   ]);
    // }
    // catch (err) {
    //   interaction.editReply({ content: `${ emojis.error } ${ member }, can't update ticket permissions (unclaim):\n\`\`\`${ err.message }\`\`\`` });
    //   return;
    // }

    // Update ticket claim info
    ticket.claimed = false;
    ticket.claimedBy = null;
    await ticket.save();

    // User feedback
    interaction.editReply(`${ emojis.success } ${ member }, you have unclaimed this ticket - channel has been unlocked`);
    channel
      .send(`${ emojis.success } <@${ ticket.userId }>, ${ member } has unclaimed your ticket, channel has been unlocked - please wait patiently for someone else to claim your ticket`)
      .catch(() => { /* void */ });

    // Identify unclaimed ticket in name - Removes 📍 from start
    channel.setName(channel.name.replaceAll('📍', ''))
      .catch(() => { /* Void */ });

    // Ticket logging
    ticketLog({
      ticket,
      action,
      ticketPanel,
      actionEmoji: '📌',
      actionText: 'Unclaimed',
      guild,
      member
    });
  }
});

