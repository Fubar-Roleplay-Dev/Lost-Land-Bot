const ticketPanels = require('../../../config/tickets');
const { ChatInputCommand } = require('../../classes/Commands');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');
const { TicketModel } = require('../../mongo/Ticket');
const { EmbedBuilder } = require('discord.js');

module.exports = new ChatInputCommand({
  global: true,
  data: { description: 'View ticket stats for a Ticket channel' },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  /**
   *
   * @param {*} client
   * @param {ChatInputCommandInteraction} interaction
   * @returns
   */
  run: async (client, interaction) => {
    // Declarations
    const { member, channel } = interaction;
    const { emojis } = client.container;

    // Defer our reply
    await interaction.deferReply({ ephemeral: true });

    // Fetch ticket data
    const ticket = await TicketModel.findOne({ channelId: channel.id });
    if (!ticket) {
      interaction.editReply(`${ emojis.error } ${ member }, no ticket is active in this channel - this command has been cancelled`);
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
      interaction.editReply(`${ emojis.error } ${ member }, ticket action with index **\`${ ticket.actionIndex }\`** is not defined, you should probably re-deploy your ticket panel with \`/deploy-ticket-panel\``);
      return;
    }

    // Should NOT be ticket user
    const ticketRolePerms = resolveOverridableConfigKey('_rolePermissions', {
      ticketPanel, action, serverIdentifier: ticket.serverIdentifier
    });
    if (member.id === ticket.userId && !member._roles.some((id) => ticketRolePerms.includes(id))) {
      interaction.editReply(`${ emojis.error } ${ member }, you can't use this command because you've created the ticket, this information is for admins - this command has been cancelled`);
      return;
    }

    // Fetch first message
    const firstMessage = (await channel.messages.fetch({
      after: 0,
      limit: 1
    }))?.first();

    // No first message
    if (!firstMessage) {
      interaction.editReply(`${ emojis.error } ${ member }, can't resolve first channel message - please try again later`);
      return;
    }

    // Initial message not by client
    if (firstMessage.author.id !== client.user.id) {
      interaction.editReply(`${ emojis.error } ${ member }, the first message that contains the ticket information has been deleted or can't be resolved - this command has been cancelled`);
      return;
    }

    // Fetch and aggregate
    const ticketCountData = await TicketModel.aggregate([
      { $match: {
        userId: { $in: [ ticket.userId ] },
        guildId: { $in: [ ticket.guildId ] }
      } },
      { $group: {
        _id: '$userId',
        count: { $sum: 1 }
      } }
    ]);

    // User Feedback
    interaction.editReply({
      embeds: [
        ...firstMessage.embeds,
        new EmbedBuilder({ color: firstMessage.embeds[0].color })
          .setTitle('Additional Ticket/User Information')
          .addFields({
            name: 'Total Tickets by User',
            value: `${ ticketCountData[0]?.count ?? 0 }`,
            inline: false
          }, {
            name: 'Escalation Level',
            value: `${ ticket.escalationLevel ?? 0 }${
              ticket.escalationLevel !== 0
                ? ` (<@&${ ticketPanel.escalationRoleIds[ticket.escalationLevel - 1] }>)`
                : ''
            }`,
            inline: false
          }, {
            name: 'Claimed',
            value: ticket.claimed ? `<@${ ticket.claimedBy }>` : emojis.error
          })
      ],
      components: firstMessage.components
    });
  }
});
