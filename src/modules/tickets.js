/* eslint-disable require-atomic-updates */
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField
} = require('discord.js');
const ticketPanels = require('../../config/tickets');
const { MS_IN_ONE_DAY } = require('../constants');
const { promptModal } = require('./ticket-modal');
const { getUser } = require('../mongo/User');
const { TicketModel } = require('../mongo/Ticket');
const { colorResolver } = require('../util');
const { stripIndents } = require('common-tags');
const logger = require('@mirasaki/logger');
const { ticketLog } = require('./ticket-logging');
const { resolveOverridableConfigKey } = require('./ticket-config');
const { getGuildSettings, db } = require('./db');
const { closeTicket } = require('../interactions/buttons/tickets/ticket-close');


const setTicketAction = async ({
  client,
  interaction,
  ticket,
  targetAction: action,
  serverCfg,
  prevAction,
  onFinish = null
// eslint-disable-next-line sonarjs/cognitive-complexity
}) => {
  const {
    guild,
    member,
    channel,
    channelId
  } = interaction;
  const { emojis } = client.container;
  const ticketPanel = action.panel;

  const waitForFormSubmission = () => {
    return new Promise((resolve, reject) => {
      let modalSubmitInteraction;
      const { formEntries } = action;
      const collectFormButtonId = `@ticket-collect-form@${ ticket._id }`;

      if (formEntries && formEntries[0]) {
        // Defer reply edge case - stall for over 15 minutes
        interaction.editReply(`${ emojis.wait } ${ member }, waiting for form submission...`);

        // Collect form if appropriate
        // Before resolving new embeds
        channel.send({
          content: `<@${ ticket.userId }>, please provide the following information to continue:`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(collectFormButtonId)
                .setLabel('Provide Form Details')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✏️')
            )
          ]
        })
          .then((msg) => {
            // Create a message component interaction collector
            const filter = (i) => i.customId === collectFormButtonId;
            const collector = msg.createMessageComponentCollector({
              filter,
              time: MS_IN_ONE_DAY * 2
            });

            collector.on('end', (collected, reason) => {
              // Throw, expired - don't resolve
              if (reason !== 'ok') reject(new Error('Form submission collector ended without success.'));
            });

            collector.on('collect', async (i) => {
              // Prompt the modal
              const user = await getUser(ticket.userId);
              // eslint-disable-next-line sonarjs/no-nested-template-literals
              const collectFormModalId = `@ticket-collect-form-modal@${ ticket._id }${ serverCfg ? `@${ serverCfg.CFTOOLS_SERVER_API_ID }` : '' }`;
              const modal = await promptModal({
                action: action,
                actionIndex: action.panel.actions.indexOf(action),
                interaction: i,
                panelIndex: ticketPanels.indexOf(action.panel),
                serverApiId: serverCfg?.CFTOOLS_SERVER_API_ID ?? null,
                ticketPanel: ticketPanels.at(ticket.panelIndex),
                user,
                id: collectFormModalId,
                useDefaultId: false,
                returnModal: true
              });

              await i.showModal(modal);

              modalSubmitInteraction = await i.awaitModalSubmit({
                filter: (i) => i.customId === collectFormModalId,
                time: MS_IN_ONE_DAY * 2
              });

              await modalSubmitInteraction.reply({
                content: `${ emojis.success } ${ modalSubmitInteraction.member }, your form has been submitted successfully!`,
                ephemeral: true
              }).catch(() => {
                /* Void */
              });

              await msg.delete().catch(() => {
                /* Void */
              });

              collector.stop('ok');

              resolve(modalSubmitInteraction); // Resolve the promise when the form is submitted successfully
            });
          });
      }
      else {
        // No formEntries or formEntries[0] found
        reject(new Error('No form entries found.'));
      }
    });
  };

  let modalSubmitInteraction;
  const { formEntries } = action;
  if (formEntries && formEntries[0]) {
    try {
      modalSubmitInteraction = await waitForFormSubmission();
      await interaction.editReply(`${ emojis.success } ${ member }, form submitted successfully!`);
    }
    catch (err) {
      console.error(err);
      interaction.editReply(`${ emojis.error } ${ member }, form submission timed out - this command has been cancelled`)
        .catch(() => {});
      return;
    }
  }

  // Resolve and check category
  const categoryId = resolveOverridableConfigKey('_categoryOpenTicketId', {
    ticketPanel,
    action,
    serverIdentifier: serverCfg?.NAME ?? null
  });
  const category = await guild.channels.fetch(categoryId);
  if (!category) {
    interaction.editReply({ content: `${ emojis.error } ${ member }, invalid configuration. Specified category (\`${ categoryId }\`) to create ticket channel doesn't exist.` });
    return;
  }

  // Resolve user
  const user = await getUser(ticket.userId);
  if (!user) {
    interaction.editReply(`${ emojis.error } ${ member }, service temporarily unavailable - please try again later`);
    return;
  }

  // Update user data defaults
  const steamFormEntry = action.formEntries.find((e) => e.isSteamId === true);
  if (steamFormEntry) {
    const steamVal = modalSubmitInteraction.fields.getTextInputValue(`${ action.formEntries.indexOf(steamFormEntry) }`)?.trim();
    if (steamVal) {
      user.steamId = steamVal;
      await user.save();
    }
  }

  // Fetch last ticket for panel and action to determine
  // current ticketIndex
  const lastTicket = await TicketModel.findOne({
    guildId: guild.id,
    panelIndex: ticketPanels.indexOf(ticketPanel),
    actionIndex: ticketPanel.actions.indexOf(action)
  }).sort({ index: -1 });
  const newIndex = lastTicket ? (lastTicket.index ?? 0) + 1 : 1;
  const newIndexOutput = newIndex.toString().padStart(4, '0');

  // Try to create the ticket channel
  const ticketRolePerms = resolveOverridableConfigKey('_rolePermissions', {
    ticketPanel,
    action,
    serverIdentifier: serverCfg?.NAME ?? null
  });
  const ticketIndexJoinStr = resolveOverridableConfigKey('_ticketIndexJoinStr', {
    ticketPanel,
    action,
    serverIdentifier: serverCfg?.NAME ?? null
  }) ?? '-';
  const buttonName = `${ action.buttonEmoji ?? '' }${
    action.buttonText ? `${ action.buttonEmoji ? ' ' : '' }${ action.buttonText }` : ''
  }`.trim();
  const ticketUserName = channel.name.slice(channel.name.indexOf('-') + 1);
  try {
    await channel.edit({
      name: `${ newIndexOutput }${ ticketIndexJoinStr }${ ticketUserName }`,
      topic: `[${ ticketUserName }] - ${ buttonName } (${ ticket.userId })`,
      reason: 'Ticket action changed',
      parent: categoryId,
      lockPermissions: false,
      // Reset permissions - claimed_by set to null in backend
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [ PermissionsBitField.Flags.ViewChannel ]
        },
        {
          id: ticket.userId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        ...ticketRolePerms.map((id) => ({
          id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }))
      ]
    });
  }
  catch (err) {
    if (interaction.isRepliable()) interaction.editReply({ content: `${ emojis.error } ${ member }, can't update ticket channel:\n\`\`\`${ err.message }\`\`\`` }).catch(() => {});
    return;
  }

  // Create new ticket
  const serverIdentifier = serverCfg?.NAME ?? null;

  ticket.claimed = null;
  ticket.claimedBy = null;
  ticket.escalationLevel = 0;
  ticket.panelIndex = ticketPanels.indexOf(ticketPanel);
  ticket.actionIndex = ticketPanel.actions.indexOf(action);
  ticket.serverIdentifier = serverIdentifier;
  ticket.index = newIndex;
  ticket.markModified('panelIndex', 'actionIndex', 'serverIdentifier', 'index');
  await ticket.save();

  // Check ticket auto-expiry cancellation
  const settings = getGuildSettings(guild.id);
  const { autoExpireTickets } = settings;
  const ticketAutoExpire = autoExpireTickets.find((e) => e.channelId === channelId);
  if (ticketAutoExpire) {
    const ticketExpireId = ticketAutoExpire.timeoutId;
    clearTimeout(ticketExpireId);
    settings.autoExpireTickets = autoExpireTickets.filter((e) => e.channelId !== channel.id);
    const guilds = db.getCollection('guilds');
    guilds.update(settings);
    msg.channel.send('Automatic ticket expiry was cancelled because panel action was changed')
      .catch(() => { /* Void */ });
  }

  const ticketCreateEmbed = {
    color: colorResolver(ticketPanel.embed.color),
    author: {
      name: `${ guild.name } Ticket Support`,
      icon_url: guild.iconURL({ dynamic: true })
    },
    description: stripIndents`
      📥 A new ticket was created by <@${ ticket.userId }>

      ${ serverIdentifier ? `**Server:** ${ serverIdentifier }` : '' }
      **User:** (**\`${ ticketUserName } - ${ ticket.userId }\`**)
      **Panel:** ${ ticketPanel.identifier } (<#${ channelId ?? channel?.id }>)
      **Action:** ${ buttonName }
    `,

    footer: { text: 'To close this ticket, react with 🔒' }
  };

  const formEntryFields = action.formEntries?.map(({ label, required }, ind) => ({
    name: label + (required ? ' *' : ''),
    value: modalSubmitInteraction?.fields.getTextInputValue(`${ ind }`)?.trim() || '-',
    inline: false
  })) ?? [];
  if (serverIdentifier) {
    formEntryFields.unshift({
      name: 'Server',
      value: serverIdentifier,
      inline: false
    });
  }
  const ticketFormEmbed = {
    color: colorResolver(ticketPanel.embed.color),
    title: 'User provided information/context:',
    author: { name: buttonName },
    fields: formEntryFields
  };

  const roleStr = ticketRolePerms
    .map((id) => `<@&${ id }>`)
    .join(` ${ emojis.separator } `);

  const embeds = [ ticketCreateEmbed, ticketFormEmbed ];

  const claimRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`@ticket-claim@${ ticket._id }`)
      .setLabel('Claim Ticket')
      .setEmoji('📍')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`@ticket-unclaim@${ ticket._id }`)
      .setLabel('Unclaim Ticket')
      .setEmoji('📌')
      .setStyle(ButtonStyle.Secondary)
  );

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`@ticket-close@${ ticket._id }`)
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`@ticket-request-close@${ ticket._id }`)
      .setLabel('Request Close')
      .setEmoji('❔')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`@ticket-auto-expire@${ ticket._id }`)
      .setLabel('Auto Close (48H)')
      .setEmoji('⏲️')
      .setStyle(ButtonStyle.Danger)
  );

  // Conditional escalate functionality
  const utilRow = new ActionRowBuilder();
  if (ticketPanel.escalationRoleIds && ticketPanel.escalationRoleIds[0]) {
    utilRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`@ticket-escalate@${ ticket._id }`)
        .setLabel('Escalate')
        .setEmoji('⬆️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`@ticket-deescalate@${ ticket._id }`)
        .setLabel('De-escalate')
        .setEmoji('⬇️')
        .setStyle(ButtonStyle.Primary)
    );
  }

  // After escalation, add VC button
  if (ticketPanel.hasDedicatedSupportVCs) utilRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`@ticket-vc@${ ticket._id }`)
      .setLabel('Support VC')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`@ticket-vc-end@${ ticket._id }`)
      .setLabel('End VC')
      .setEmoji('🔇')
      .setStyle(ButtonStyle.Success)
  );


  const shouldPing = resolveOverridableConfigKey('_pingOnTicketCreation', {
    ticketPanel,
    action,
    serverIdentifier: serverCfg?.NAME ?? null
  });
  const ticketMessage = resolveOverridableConfigKey('_ticketCreationMessage', {
    ticketPanel,
    action,
    serverIdentifier: serverCfg?.NAME ?? null
  })?.replaceAll('{@member}', `<@${ ticket.userId }>`);
  const pingAppendix = shouldPing ? `\n\n${ roleStr }` : '';
  const components = [ claimRow ];
  components.push(utilRow);
  components.push(controlRow);
  const msg = await channel.send({
    content: `${ ticketMessage }${ pingAppendix }`,
    embeds,
    components
  });

  // Unpin original messages
  // Keep in chat for traceability
  const pinnedMessages = await channel.messages.fetchPinned();
  const messagesToUnPin = pinnedMessages.filter((m) => m.author.id === client.user.id);
  if (messagesToUnPin.size >= 1) await Promise.all(
    messagesToUnPin.map((m) => m.unpin().catch(() => { /* Void */ }))
  ).catch(() => { /* Void */ });

  // Resolve ticket member
  let ticketMember = await guild.members.fetch(ticket.userId)
    .catch(() => { /* Void */ });
  ticketMember = guild.members.cache.get(ticket.userId);

  // Make sure we have a member, has to be in server still
  if (!ticketMember) {
    interaction.editReply({
      content: `${ emojis.error } ${ member }, can't resolve ticket member - this command has been cancelled`,
      ephemeral: true
    }).catch(() => {});
    return;
  }

  // Try to pin message
  if (msg.pinnable) msg.pin().catch((err) => {
    logger.syserr('Error encountered while trying to pin ticket message:');
    logger.printErr(err);
  });


  // Feedback
  const oldButtonName = `${ prevAction.buttonEmoji ?? '' }${
    prevAction.buttonText ? `${ prevAction.buttonEmoji ? ' ' : '' }${ prevAction.buttonText }` : ''
  }`.trim();
  interaction.editReply(`${ emojis.success } ${ member }, ticket action changed from **${ oldButtonName }** to **${ buttonName }**`)
    .catch(() => {});

  if (typeof onFinish === 'function') {
    onFinish();
  }

  // Ticket logging
  ticketLog({
    ticket,
    action,
    ticketPanel,
    actionEmoji: '🔄',
    actionText: 'Changed Ticket Action~',
    guild,
    member,
    fields: [
      {
        name: '❌ Old Action',
        value: oldButtonName,
        inline: true
      },
      {
        name: '☑️ New Action',
        value: buttonName,
        inline: true
      }
    ]
  });
};

// [DEV] - Debug logging and cleaning up data
// if resource are invalid
const backlogAutoExpiredTickets = async (client) => {
  const guilds = db.getCollection('guilds');
  // eslint-disable-next-line sonarjs/cognitive-complexity
  guilds.data.forEach(async (guild) => {
    const { autoExpireTickets } = guild;
    if (autoExpireTickets.length === 0) return;
    for await (const { channelId,
      expireDate } of autoExpireTickets) {
      const ticket = await TicketModel.findOne({ channelId });
      if (!ticket) continue;
      const guild = await client.guilds.fetch(ticket.guildId).catch();
      if (!guild) continue;
      const channel = guild.channels.cache.get(channelId);
      if (!channel) continue;
      await guild.members.fetch(ticket.userId).catch();
      const member = guild.members.cache.get(ticket.userId);
      if (!member) continue;
      const ticketPanel = ticketPanels.at(ticket.panelIndex);
      if (!ticketPanel) continue;
      const action = ticketPanel.actions.at(ticket.actionIndex);
      if (!action) continue;

      const expires = new Date(expireDate).valueOf();
      const now = new Date().valueOf();
      if (expires < now) {
        closeTicket({
          action,
          client,
          interaction: {
            channel, member, guild
          },
          ticketPanel,
          reason: 'Ticket automatically expired after 48 hours of inactivity (might be late as this action was in the boot-process backlog)',
          actionEmoji: '⏲️',
          actionText: 'Auto-Closed'
        });
      }
    }
  });
};

module.exports = {
  setTicketAction, backlogAutoExpiredTickets
};
