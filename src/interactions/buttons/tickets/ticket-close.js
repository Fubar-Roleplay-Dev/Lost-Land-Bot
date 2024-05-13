const { ComponentCommand } = require('../../../classes/Commands');
const { colorResolver } = require('../../../util');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits
} = require('discord.js');
const { TicketModel } = require('../../../mongo/Ticket');
const ticketPanels = require('../../../../config/tickets');
const discordTranscripts = require('discord-html-transcripts');
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
      content: `${ emojis.wait } ${ member }, are you sure you want to close this ticket?\n\nRespond with a reason for closing this ticket, or use the buttons below\n\nYou have 5 minutes before this action cancels`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('@ticket-close-without-reason')
            .setLabel('Close without reason')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('@ticket-close-cancel')
            .setLabel('Cancel, don\'t close')
            .setStyle(ButtonStyle.Success)
        )
      ]
    });

    // Check for CLOSE WITHOUT REASON
    const MS_IN_FIVE_MINUTES = 1000 * 60 * 5;
    const filter = (i) => i.customId === '@ticket-close-without-reason' && i.user.id === member.id;
    const closeWithoutReasonCollector = interaction.channel.createMessageComponentCollector({
      filter, time: MS_IN_FIVE_MINUTES, max: 1
    });
    closeWithoutReasonCollector.on('collect', async (i) => closeTicket({
      client,
      interaction,
      action,
      ticketPanel,
      i
    }));

    // Collect message with reason
    const reasonFilter = (m) => m.author.id === member.id;
    const reasonCollector = channel.createMessageCollector({
      filter: reasonFilter, time: MS_IN_FIVE_MINUTES, max: 1
    });
    reasonCollector.on('collect', (m) => closeTicket({
      client,
      interaction,
      action,
      ticketPanel,
      reason: m.content
    }));

    // CANCEL, don't close
    const filterCancel = (i) => i.customId === '@ticket-close-cancel' && i.user.id === member.id;
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

const closeTicket = async ({
  client,
  interaction,
  ticketPanel,
  action,
  i,
  reason = null,
  actionText = 'Closed',
  actionEmoji = '🔒'
// eslint-disable-next-line sonarjs/cognitive-complexity
} = {}) => {
  const {
    channel, member, guild
  } = interaction;
  const { emojis } = client.container;

  // Fetch ticket
  const ticket = await TicketModel.findOne({ channelId: channel.id });
  if (!ticket) {
    await i.update({
      content: `${ emojis.error } ${ member }, can't fetch ticket data - please try again later`,
      components: []
    });
    return;
  }

  // Make sure we acknowledge
  await channel.send({ content: `${ emojis.wait } ${ member }, please be patient while the ticket is being closed, all messages are being retrieved, and a transcript is being generated` });
  if (i) {
    await i.update(`${ emojis.success } ${ member }, closing ticket...`).catch(() => { /* void */ });
    await i.deleteReply().catch(() => { /* void */ });
  }

  // Generate the transcript
  const transcriptFile = await discordTranscripts.createTranscript(channel, {
    limit: -1, // Max amount of messages to fetch. `-1` recursively fetches.
    returnType: 'attachment', // Valid options: 'buffer' | 'string' | 'attachment' Default: 'attachment' OR use the enum ExportReturnType
    saveImages: true, // Download all images and include the image data in the HTML (allows viewing the image even after it has been deleted) (! WILL INCREASE FILE SIZE !)
    footerText: 'Exported {number} message{s}', // Change text at footer, don't forget to put {number} to show how much messages got exported, and {s} for plural
    poweredBy: false // Whether to include the "Powered by discord-html-transcripts" footer
  }).catch(() => { /* Void */ });

  // Save the ticket
  if (ticket) {
    // ticket.transcript = ticketTranscript;
    // ticket.markModified('transcript');
    ticket.closed = true;
    ticket.closedBy = member.id;
    ticket.reason = reason ?? null;
    await ticket.save();
  }

  // Try to send transcript to user
  try {
    const buttonName = `${ action.buttonEmoji ?? '' }${
      action.buttonText ? `${ action.buttonEmoji ? ' ' : '' }${ action.buttonText }` : ''
    }`.trim();
    const ticketMember = await guild.members.fetch(ticket.userId);
    if (ticketMember) {
      const reasonAppendix = reason ? `\n**Reason:**\n\`\`\`\n${ reason }\n\`\`\`` : '';
      await ticketMember.createDM();
      ticketMember.send({
        embeds: [
          {
            color: colorResolver(),
            description: `Your ticket has been closed. Please refer to transcript if needed${ reasonAppendix }`
          }
        ],
        files: [ transcriptFile ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('@void-ticket-close-dm-1')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
              .setLabel(`Guild: ${ guild.name }`),
            new ButtonBuilder()
              .setCustomId('@void-ticket-close-dm-2')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
              .setLabel(`Panel: ${ ticketPanel.embed?.title ?? ticketPanel.identifier }`),
            new ButtonBuilder()
              .setCustomId('@void-ticket-close-dm-3')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
              .setLabel(`Action: ${ buttonName }`)
          )
        ]
      }).catch((err) => {
        console.error(err);
      });
    }
  }
  catch {
    // Continue if we can't DM them
  }

  ticketLog({
    ticket,
    guild,
    action,
    ticketPanel,
    member,
    actionEmoji,
    actionText,
    fields: [
      {
        name: '🔍 Reason',
        value: reason ?? 'No reason was provided',
        inline: false
      }
    ],
    files: [ transcriptFile ]
  });

  // Delete the channel O;
  await channel
    .delete()
    .catch(() => { /* Continue silently if we don't have permission */ });
};
module.exports.closeTicket = closeTicket;

