/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonarjs/no-all-duplicated-branches */
const { ComponentCommand } = require('../../../classes/Commands');
const { PermissionFlagsBits,
  ChannelType } = require('discord.js');
const { resolveOverridableConfigKey } = require('../../../modules/ticket-config');
const { TicketModel } = require('../../../mongo/Ticket');
const ticketPanels = require('../../../../config/tickets');
const { ticketLog } = require('../../../modules/ticket-logging');

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
      member, guild, channel, customId
    } = interaction;
    const { emojis } = client.container;

    const [
      , // @
      , // action
      ticketId
    ] = customId.split('@');

    // Defer a reply to the interaction
    await interaction.deferReply();

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

    // Make sure we have a parent category to work with
    if (!channel.parent) {
      interaction.editReply(`${ emojis.error } ${ member }, this ticket is missing a parent category - this command has been cancelled`)
        .catch(() => {});
      return;
    }

    // Ok, start end VC process
    const vcName = `🔊 ${ channel.name
      .replaceAll('-', ' ')
      .replaceAll('📍', '')
      .replaceAll('🔊', '')
      .replaceAll('⏰', '')
      .replaceAll('📌', '')
      .replaceAll('⬆️', '')
      .replaceAll('🔒', '')
    }`;
    console.log(channel.name, vcName);
    const vc = guild.channels.cache.find((c) => c.name === vcName
      && c.type === ChannelType.GuildVoice
      && c.parentId === channel.parentId);
    if (!vc) {
      interaction.editReply(`${ emojis.error } ${ member }, can't find support VC for ticket #${ ticket.index } - please try again later`);
      return;
    }
    await vc.delete(`VC Support session ended for ticket #${ ticket.index }`);

    interaction.editReply(`${ emojis.success } ${ member }, dedicated support channel for ticket #${ ticket.index } has been closed`);

    // Identify cancel - Removes 🔊 from start
    channel.setName(channel.name.replaceAll('🔊', ''))
      .catch(() => { /* Void */ });

    ticketLog({
      actionText: 'Ended Support VC~',
      actionEmoji: '🔇',
      ticket,
      guild,
      member,
      action,
      ticketPanel
    });
  }
});
