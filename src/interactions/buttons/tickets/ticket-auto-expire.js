/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonarjs/no-all-duplicated-branches */
const { ComponentCommand } = require('../../../classes/Commands');
const { PermissionFlagsBits } = require('discord.js');
const { TicketModel } = require('../../../mongo/Ticket');
const { closeTicket } = require('./ticket-close');
const { MS_IN_ONE_DAY } = require('../../../constants');
const ticketPanels = require('../../../../config/tickets');
const { getGuildSettings, db } = require('../../../modules/db');

const MS_IN_TWO_DAYS = MS_IN_ONE_DAY * 2;

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
    await interaction.deferReply({ ephemeral: false });

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

    // Already active
    const settings = getGuildSettings(channel.guild.id);
    const { autoExpireTickets } = settings;
    if (autoExpireTickets.find((e) => e.channelId === channel.id)) {
      interaction.editReply(`${ emojis.error } ${ member }, auto-expiry is already active for this ticket - this command has been cancelled`);
      return;
    }

    // Check is claimed
    // if (!ticket.claimed || !ticket.claimedBy) {
    //   interaction.editReply(`${ emojis.error } ${ member }, this ticket hasn't been claimed and therefor cannot be closed - claim the ticket and try again`);
    //   return;
    // }

    // Original date
    const currentDate = new Date();

    // Add 48 hours (48 * 60 * 60 * 1000 milliseconds) to the current date
    const expireDate = new Date(currentDate.getTime() + MS_IN_TWO_DAYS);

    // Schedule expiry
    const timeoutId = setTimeout(() => {
      closeTicket({
        action,
        client,
        interaction,
        ticketPanel,
        reason: 'Ticket automatically expired after 48 hours of inactivity',
        actionEmoji: '⏲️',
        actionText: 'Auto-Closed'
      });
      // Refresh settings
      const settings = getGuildSettings(channel.guild.id);
      const { autoExpireTickets } = settings;
      settings.autoExpireTickets = autoExpireTickets.filter((e) => e.channelId !== channel.id);
      const guilds = db.getCollection('guilds');
      guilds.update(settings);
    }, MS_IN_TWO_DAYS);

    // Identify auto-expiring tickets in name
    channel.setName(`⏰${ channel.name }`)
      .catch(() => { /* Void */ });

    // Confirmation prompt to close ticket
    await interaction.editReply({
      content: `${ emojis.success } ${ member }, this ticket will be automatically closed after 48 hours of inactivity (<t:${
        Math.round(expireDate.valueOf() / 1000)
      }:R>) - this is automatically cancelled if <@${ ticket.userId }> sends a message in this ticket-channel.`,
      components: []
    });

    autoExpireTickets.push({
      ticketId: ticket._id,
      channelId: channel.id,
      expireDate,
      timeoutId: `${ timeoutId }`
    });
    settings.autoExpireTickets = autoExpireTickets;
    const guilds = db.getCollection('guilds');
    guilds.update(settings);
  }
});
