const { ComponentCommand } = require('../../classes/Commands');
const { getGuildSettings, db } = require('../../modules/db');
const {
  EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { clientConfig } = require('../../util');
const { stripIndents } = require('common-tags');
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
    approvedRoleIds,
    approvedMessage,
    accessRoleIds,
    acceptedChannelId
  } = applicationPanelOption;

  // Check required permissions
  const hasRequiredRoles = accessRoleIds.some(
    (roleId) => member.roles.cache.has(roleId)
  );
  if (!hasRequiredRoles) {
    interaction.reply({
      content: 'You do not have the required roles to use this component - this action has been cancelled',
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

  // Defer our reply to interaction
  await interaction.deferReply({ ephemeral: true });

  // Resolve message
  const msg = await channel.messages.fetch(application.msgId).catch();
  if (!msg) {
    interaction.editReply({
      content: 'Unable to find application message.',
      ephemeral: true
    });
    return;
  }

  // Resolve user
  const user = await client.users.fetch(application.discordId).catch();
  if (!user) {
    interaction.editReply({
      content: 'Unable to find application user.',
      ephemeral: true
    });
    return;
  }

  // Update database
  application.status = 'approved';
  application.reviewedBy = member.id;
  application.reviewedAt = new Date();
  const guilds = db.getCollection('guilds');
  guilds.update(settings);

  // Add roles
  const guildMember = await guild.members.fetch(user.id).catch();
  if (guildMember) {
    await guildMember.roles.add(approvedRoleIds).catch((err) => {
      interaction.followUp({
        // eslint-disable-next-line sonarjs/no-nested-template-literals
        content: `Unable to add roles to ${ user }: ${ err.message }\n\nPlease add the following roles manually: ${ approvedRoleIds.map((roleId) => `<@&${ roleId }>`).join(', ') }`,
        ephemeral: true
      });
    });
  }

  // Create new embed
  const embed = new EmbedBuilder(msg.embeds[0]);
  embed.setColor(Colors.Green);
  embed.setDescription(stripIndents`
    **Status:** Approved
    **Reviewed by:** ${ member } (${ member.user.username })
    **Reviewed at:** <t:${ Math.floor(new Date().valueOf() / 1000) }:R>
    **Created at:** <t:${ Math.floor(application.createdAt / 1000) }:R>
  `);

  // Update original
  await msg.edit({
    embeds: [ embed ],
    components: []
  });

  // Send to accepted channel if applicable
  if (acceptedChannelId) {
    const acceptedChannel = guild.channels.cache.get(acceptedChannelId);
    if (acceptedChannel) {
      await acceptedChannel.send({ embeds: [ embed ] }).catch(() => {
        interaction.followUp({
          content: `Unable to send accepted application to channel <#${ acceptedChannelId }>`,
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
      content: approvedMessage,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('@application-approve@void')
            .setEmoji('☑️')
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

  interaction.editReply({
    content: `Successfully approved application for ${ user }`,
    ephemeral: true
  });
} });
