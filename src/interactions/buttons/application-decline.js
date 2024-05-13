const { ComponentCommand } = require('../../classes/Commands');
const { getGuildSettings, db } = require('../../modules/db');
const {
  EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { clientConfig, replaceMessageTags } = require('../../util');
const { stripIndents } = require('common-tags');
const { MS_IN_ONE_DAY } = require('../../constants');
const { applicationPanels } = clientConfig;

module.exports = new ComponentCommand({ run: async (client, interaction) => {
  const {
    guild, member, customId,
    channel
  } = interaction;

  // Resolve and make sure we have an option
  const [
    , // void @
    , // void action
    applicationIndexStr
  ] = customId.split('@');
  const applicationIndex = Number(applicationIndexStr);

  // Resolve application panel
  const settings = getGuildSettings(guild.id);
  const application = settings.applications.find((e) => e.index === applicationIndex);
  if (!application) {
    interaction.reply({
      content: 'Invalid application.',
      ephemeral: true
    });
    return;
  }

  // Resolve application panel and option
  const { applicationPanelInd, applicationPanelOptionInd } = application;
  const applicationPanel = applicationPanels[applicationPanelInd];
  if (!applicationPanel) {
    interaction.reply({
      content: 'Invalid application panel. This likely means the application panel was edited without being re-deployed, please contact an administrator',
      ephemeral: true
    });
    return;
  }
  const applicationPanelOption = applicationPanel.options[applicationPanelOptionInd];
  if (!applicationPanelOption) {
    interaction.reply({
      content: 'Invalid application panel option. This likely means the application panel was edited without being re-deployed, please contact an administrator',
      ephemeral: true
    });
    return;
  }

  const {
    declinedMessage,
    accessRoleIds,
    declinedChannelId
  } = applicationPanelOption;

  // Check required permissions
  const hasRequiredRoles = accessRoleIds.some(
    (roleId) => member.roles.cache.has(roleId)
  );
  if (!hasRequiredRoles) {
    interaction.reply({
      content: 'You do not have the required roles to use this command.',
      ephemeral: true
    });
    return;
  }

  // Check is pending
  if (application.status !== 'pending') {
    interaction.reply({
      content: `This application has already been reviewed. Please refer to application [here](${ application.msgUrl })`,
      ephemeral: true
    });
    return;
  }

  // Resolve message
  const msg = await channel.messages.fetch(application.msgId).catch();
  if (!msg) {
    interaction.reply({
      content: 'Unable to find application message.',
      ephemeral: true
    });
    return;
  }

  // Resolve user
  const user = await client.users.fetch(application.discordId).catch();
  if (!user) {
    interaction.reply({
      content: 'Unable to find application user.',
      ephemeral: true
    });
    return;
  }

  // Collect reason
  const reasonModal = new ModalBuilder()
    .setCustomId('@application-decline-reason')
    .setTitle('Application Decline Reason')
    .setComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setPlaceholder('Enter the reason for declining this application...')
          .setMaxLength(2000)
          .setMinLength(2)
          .setRequired(true)
          .setStyle(TextInputStyle.Paragraph)
      )
    );

  await interaction.showModal(reasonModal);

  let i;
  const filter = (interaction) => interaction.customId === '@application-decline-reason';
  try {
    i = await interaction.awaitModalSubmit({
      filter, time: MS_IN_ONE_DAY
    });
  }
  catch (err) {
    // Expired/not collected
    return;
  }

  i.reply({
    content: 'Processing...',
    ephemeral: true
  });

  const reason = i.fields.getTextInputValue('reason');

  // Update database
  application.status = 'declined';
  application.reason = reason;
  application.reviewedBy = member.id;
  application.reviewedAt = new Date();
  const guilds = db.getCollection('guilds');
  guilds.update(settings);

  // Create new embed
  const embed = new EmbedBuilder(msg.embeds[0]);
  embed.setColor(Colors.Red);
  embed.setDescription(stripIndents`
    **Status:** Declined
    **Reviewed by:** ${ member } (${ member.user.username })
    **Reviewed at:** <t:${ Math.floor(new Date().valueOf() / 1000) }:R>
    **Created at:** <t:${ Math.floor(application.createdAt / 1000) }:R>
    **Reason:** ${ reason }
  `);

  // Update original
  await msg.edit({
    embeds: [ embed ],
    components: []
  });

  // Send to declined channel if applicable
  if (declinedChannelId) {
    const declinedChannel = guild.channels.cache.get(declinedChannelId);
    if (declinedChannel) {
      await declinedChannel.send({ embeds: [ embed ] }).catch(() => {
        interaction.followUp({
          content: `Unable to send declined application to channel <#${ declinedChannelId }>`,
          ephemeral: true
        });
      });
    }
  }

  const userChannel = await user.createDM().catch(() => {
    interaction.followUp({
      content: `Unable to DM ${ user } as they have DM's closed. Please notify them manually.`,
      ephemeral: true
    });
  });
  if (userChannel) {
    userChannel.send({
      content: replaceMessageTags(declinedMessage, { reason }),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('@application-decline@void')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`Server: ${ guild.name }`)
            .setDisabled(true)
        )
      ]
    }).catch(() => {
      interaction.followUp({
        content: `Unable to DM ${ user } as they have DM's closed. Please notify them manually.`,
        ephemeral: true
      });
    });
  }

  i.editReply({
    content: `Successfully declined application for ${ user }`,
    ephemeral: true
  });
} });
