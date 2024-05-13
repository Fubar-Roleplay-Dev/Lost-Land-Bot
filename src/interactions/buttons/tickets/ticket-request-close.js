/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonarjs/no-all-duplicated-branches */
const { ComponentCommand } = require('../../../classes/Commands');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits
} = require('discord.js');
const { TicketModel } = require('../../../mongo/Ticket');
const { closeTicket } = require('./ticket-close');
const ticketPanels = require('../../../../config/tickets');

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
      member, channel, customId
    } = interaction;
    const { emojis } = client.container;
    const [
      , // @
      , // action
      ticketId
    ] = customId.split('@');

    // Defer a reply to the interaction
    await interaction.deferReply({ ephemeral: true });

    // Check status
    const ticket = await TicketModel.findOne({ _id: ticketId });
    if (!ticket) {
      interaction.editReply(`${ emojis.error } ${ member }, can't resolve ticket data - please try again later`);
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

    // Check is claimed
    // if (!ticket.claimed || !ticket.claimedBy) {
    //   interaction.editReply(`${ emojis.error } ${ member }, this ticket hasn't been claimed and therefor cannot be closed - claim the ticket and try again`);
    //   return;
    // }

    // Confirmation prompt to close ticket
    await interaction.editReply({
      content: `${ emojis.wait } ${ member }, are you sure you want to request <@${ ticket.userId }> to close this ticket?\n\nRespond with a reason for closing this ticket, or use the buttons below\n\nYou have 5 minutes before this action cancels`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('@ticket-request-close-without-reason')
            .setLabel('Close without reason')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('@ticket-request-close-cancel')
            .setLabel('Cancel, don\'t close')
            .setStyle(ButtonStyle.Success)
        )
      ]
    });

    // Check for CLOSE WITHOUT REASON
    const MS_IN_FIVE_MINUTES = 1000 * 60 * 5;
    const filter = (i) => i.customId === '@ticket-request-close-without-reason' && i.user.id === member.id;
    const closeWithoutReasonCollector = interaction.channel.createMessageComponentCollector({
      filter, time: MS_IN_FIVE_MINUTES, max: 1
    });
    closeWithoutReasonCollector.on('collect', async (i) => {
      // Edit prompt
      interaction.editReply({
        content: `${ emojis.wait } ${ member }, waiting for member to accept or decline close request`,
        components: []
      });

      // Prompt user request close
      const rplMSg = await i.reply({
        content: `${ emojis.wait } <@${ ticket.userId }>, ${ i.member } is requesting to close your ticket - you have 5 minutes before this action cancels`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('@ticket-request-close-accept')
              .setLabel('Accept')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('@ticket-request-close-decline')
              .setLabel('Decline')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });

      // Collect accept without reason
      const filter = (i) => i.customId === '@ticket-request-close-accept' && i.user.id === ticket.userId;
      const acceptCloseRequestCollector = interaction.channel.createMessageComponentCollector({
        filter, time: MS_IN_FIVE_MINUTES, max: 1
      });
      acceptCloseRequestCollector.on('collect', async (i) => {
        interaction.editReply(`${ emojis.success } ${ member }, user has accepted the close ticket request`);
        closeTicket({
          client,
          interaction,
          action,
          ticketPanel,
          i,
          actionEmoji: '❓',
          actionText: 'Request-Closed'
        });
      });

      // Collect decline
      const declineFilter = (i) => i.customId === '@ticket-request-close-decline' && i.user.id === ticket.userId;
      const declineCloseRequestCollector = interaction.channel.createMessageComponentCollector({
        filter: declineFilter, time: MS_IN_FIVE_MINUTES, max: 1
      });
      declineCloseRequestCollector.on('collect', async (i) => {
        interaction.editReply(`${ emojis.success } ${ member }, user has declined the close ticket request`);
        await i.reply(`${ emojis.error } <@${ i.user.id }>, request to close ticket was declined`);
        i.deleteReply();
        await rplMSg.delete();
      });
    });

    // Collect message with reason
    const reasonFilter = (m) => m.author.id === member.id;
    const reasonCollector = channel.createMessageCollector({
      filter: reasonFilter, time: MS_IN_FIVE_MINUTES, max: 1
    });
    reasonCollector.on('collect', async (m) => {
      // Edit prompt
      interaction.editReply({
        content: `${ emojis.wait } ${ member }, waiting for member to accept or decline close request`,
        components: []
      });

      // Prompt user request close
      const rplMSg = await m.reply({
        content: `${ emojis.wait } <@${ ticket.userId }>, ${ m.author } is requesting to close your ticket with reason **\`${ m.cleanContent }\`** - you have 5 minutes before this action cancels`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('@ticket-request-close-accept')
              .setLabel('Accept')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('@ticket-request-close-decline')
              .setLabel('Decline')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });

      // Collect accept
      const filter = (i) => i.customId === '@ticket-request-close-accept' && i.user.id === ticket.userId;
      const acceptCloseRequestCollector = interaction.channel.createMessageComponentCollector({
        filter, time: MS_IN_FIVE_MINUTES, max: 1
      });
      acceptCloseRequestCollector.on('collect', async (i) => {
        // Delete reply
        m.delete().catch();

        interaction.editReply(`${ emojis.success } ${ member }, user has accepted the close ticket request`);
        closeTicket({
          client,
          interaction,
          action,
          ticketPanel,
          reason: m.content,
          actionEmoji: '❓',
          actionText: 'Request-Closed'
        });
      });

      // Collect accept
      const declineFilter = (i) => i.customId === '@ticket-request-close-decline' && i.user.id === ticket.userId;
      const declineCloseRequestCollector = interaction.channel.createMessageComponentCollector({
        filter: declineFilter, time: MS_IN_FIVE_MINUTES, max: 1
      });
      declineCloseRequestCollector.on('collect', async (i) => {
        // Delete reply
        m.delete().catch();
        interaction.editReply(`${ emojis.success } ${ member }, user has declined the close ticket request`);
        await i.reply(`${ emojis.error } <@${ i.user.id }>, request to close ticket was declined`);
        i.deleteReply();
        await rplMSg.delete();
      });
    });

    // CANCEL, don't close
    const filterCancel = (i) => i.customId === '@ticket-request-close-cancel' && i.user.id === member.id;
    const cancelCloseCollector = interaction.channel.createMessageComponentCollector({
      filter: filterCancel, time: MS_IN_FIVE_MINUTES, max: 1
    });
    cancelCloseCollector.on('collect', async (i) => {
      closeWithoutReasonCollector.stop();
      reasonCollector.stop();
      await interaction.deleteReply();
    });
  }
});
