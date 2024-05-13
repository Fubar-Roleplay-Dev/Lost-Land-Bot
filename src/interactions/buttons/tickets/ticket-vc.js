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
      member, guild, channel,
      customId
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

    // Ok, start create VC process
    const vcName = `🔊 ${ channel.name
      .replaceAll('-', ' ')
      .replaceAll('📍', '')
      .replaceAll('🔊', '')
      .replaceAll('⏰', '')
      .replaceAll('📌', '')
      .replaceAll('⬆️', '')
      .replaceAll('🔒', '')
    }`;
    const vc = await guild.channels.create({
      name: vcName,
      parent: channel.parent,
      type: ChannelType.GuildVoice,
      nsfw: false,
      permissionOverwrites: channel.permissionOverwrites.cache,
      reason: `Dedicated support channel for ticket #${ ticket.index } was required`
    });

    interaction.editReply(`${ emojis.success } ${ member }, dedicated support channel for ticket #${ ticket.index } has been created: ${ vc }`);

    // Identify auto-expiring tickets in name
    channel.setName(`🔊${ channel.name }`)
      .catch(() => { /* Void */ });

    // Ticket logging
    ticketLog({
      ticket,
      action,
      ticketPanel,
      actionEmoji: '🔊',
      actionText: 'Created Support VC~',
      guild,
      member,
      fields: [
        {
          name: '<:blurpleVoice:870270381569765406> VC',
          value: `${ vc }`,
          inline: true
        }
      ]
    });
  }
});
