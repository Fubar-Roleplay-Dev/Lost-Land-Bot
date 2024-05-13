const logger = require('@mirasaki/logger');
const { ComponentCommand } = require('../../classes/Commands');
const {
  clientConfig, colorResolver, replaceMessageTags
} = require('../../util');
const {
  EmbedBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const { MS_IN_ONE_DAY, MS_IN_ONE_HOUR } = require('../../constants');
const { getGuildSettings, db } = require('../../modules/db');
const { applicationPanels } = clientConfig;

// eslint-disable-next-line sonarjs/cognitive-complexity
module.exports = new ComponentCommand({ run: async (client, interaction) => {
  const { customId } = interaction;
  const selectTargetValue = interaction.values[0];
  const { member, guild } = interaction;
  const [
    , // void @
    , // void action
    applicationPanelIndStr
  ] = customId.split('@');
  const applicationPanelInd = parseInt(applicationPanelIndStr);
  const applicationPanel = applicationPanels[applicationPanelInd];

  if (!applicationPanel) {
    interaction.reply({
      content: 'Invalid application panel - this likely means the application panel was edited without being re-deployed, please contact an administrator',
      ephemeral: true
    });
    return;
  }

  const { options: applicationPanelOptions } = applicationPanel;
  const applicationPanelOption = applicationPanelOptions[selectTargetValue];

  if (!applicationPanelOption) {
    interaction.reply({
      content: 'Invalid application panel option - this likely means the application panel was edited without being re-deployed, please contact an administrator',
      ephemeral: true
    });
    return;
  }

  const {
    name,
    channelId,
    embed: applicationPanelOptionEmbedOptions,
    blockConsecutiveApplications,
    formInput
  } = applicationPanelOption;

  const applicationChannel = guild.channels.cache.get(channelId);
  if (!applicationChannel) {
    i.editReply({
      content: 'Application channel not found. Please contact an administrator.',
      ephemeral: true
    });
    return;
  }

  // Check is already approved
  const settings = getGuildSettings(guild.id);
  const isApproved = settings.applications.some(
    (application) => application.discordId === member.id
      && application.applicationPanelInd === applicationPanelInd
      && application.applicationPanelOptionInd === selectTargetValue
      && application.status === 'approved'
  );
  if (isApproved) {
    interaction.reply({
      content: 'You are already approved.',
      ephemeral: true
    });
    return;
  }

  // Check is declined
  const isDeclined = settings.applications.some(
    (application) => application.discordId === member.id
    && application.applicationPanelInd === applicationPanelInd
    && application.applicationPanelOptionInd === selectTargetValue
    && application.status === 'declined'
  );
  if (blockConsecutiveApplications && isDeclined) {
    interaction.reply({
      content: 'Your application has been declined. You can not apply anymore.',
      ephemeral: true
    });
    return;
  }

  // Check if the user already has an application
  const entry = settings.applications.find(
    (application) => application.discordId === member.id
      && application.applicationPanelInd === applicationPanelInd
      && application.applicationPanelOptionInd === selectTargetValue
      && application.status === 'pending'
  );
  if (entry) {
    interaction.reply({
      content: `You already have a pending application. Please review the application [here](${ entry.msgUrl })`,
      ephemeral: true
    });
    return;
  }

  if (!formInput || formInput.length === 0) {
    interaction.reply({
      content: 'This application panel has no form input, please contact an administrator',
      ephemeral: true
    });
    return;
  }

  // Collect formInput in chunks of 5
  const formInputFields = [];
  const formInputChunks = [];
  const formInputChunkSize = 5;
  for (let i = 0; i < formInput.length; i += formInputChunkSize) {
    formInputChunks.push(formInput.slice(i, i + formInputChunkSize));
  }

  let i;
  const filter = (i) => i.customId.startsWith('@application-panel-form@');
  for await (const chunk of formInputChunks) {
    const chunkInd = formInputChunks.indexOf(chunk);
    const modal = new ModalBuilder()
      .setCustomId(`@application-panel-form@${ chunkInd }`)
      .setTitle(name)
      .setComponents(
        ...chunk.map((input, ind) => {
          const textInput = new TextInputBuilder()
            .setCustomId(`@application-panel-form-input@${ ind + (chunkInd * formInputChunkSize) }`)
            .setLabel(input.label)
            .setMaxLength(input.maxLength ?? 4000)
            .setPlaceholder(input.placeholder)
            .setRequired(input.required ?? false)
            .setStyle(input.isLong ? TextInputStyle.Paragraph : TextInputStyle.Short);
          if (typeof input.minLength === 'number') textInput.setMinLength(input.minLength);
          if (
            typeof input.value === 'string'
            && input.value.length > 0
            && (typeof input.value.minLength === 'undefined' || input.value.length > input.minLength)
            && (typeof input.value.maxLength === 'undefined' || input.value.length < input.maxLength)
          ) textInput.setValue(input.value);
          return new ActionRowBuilder().addComponents(textInput);
        })
      );

    // Show modal directly if no i
    if (!i) await interaction.showModal(modal);
    else {
      const msg = await i.reply({
        content: 'Your data has been submitted, please continue to the next form',
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('@application-panel-form-next')
              .setLabel('Next')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false)
          )
        ],
        fetchReply: true,
        ephemeral: true
      });
      // Collect a message component interaction
      const nextFormFilter = (nfi) => nfi.customId === '@application-panel-form-next';
      try {
        i = await msg.awaitMessageComponent({
          filter: nextFormFilter,
          time: MS_IN_ONE_HOUR,
          componentType: ComponentType.Button
        });
      }
      catch {
        // Expired button
        return;
      }
      await i.showModal(modal);
    }

    try {
      i = await interaction.awaitModalSubmit({
        filter, time: MS_IN_ONE_DAY
      });
    }
    catch {
      // Expired modal
      return;
    }

    i.fields.fields.forEach((field) => {
      const [
        , , fieldIndStr
      ] = field.customId.split('@');
      console.log(field.customId, field.value);
      const fieldInd = parseInt(fieldIndStr);
      const fieldInput = formInput[fieldInd];
      if (!fieldInput) {
        logger.error(`Invalid field input at index ${ fieldInd }`);
        return;
      }

      formInputFields.push({
        ...fieldInput,
        value: field.value
      });
    });
  }

  // Nice, we collected all form input
  await i.reply({
    content: 'Creating application...',
    ephemeral: true
  });

  // Create the application
  const guilds = db.getCollection('guilds');
  const latestApplication = settings.applications[0];
  const newApplicationIndex = (latestApplication?.index ?? 0) + 1;
  const newApplication = {
    index: newApplicationIndex,
    discordId: member.id,
    applicationPanelInd,
    applicationPanelOptionInd: selectTargetValue,
    status: 'pending',
    msgId: null,
    msgUrl: null,
    createdAt: Date.now()
    // formInput: formInputFields
  };
  settings.applications.push(newApplication);
  guilds.update(settings);

  // Create the application embed
  const embed = new EmbedBuilder(applicationPanelOptionEmbedOptions);
  embed.setColor(colorResolver(applicationPanelOptionEmbedOptions.color));
  embed.setTitle(name);
  embed.setAuthor({
    name: `${ member.user.username }`,
    iconURL: member.user.displayAvatarURL({ dynamic: true })
  });
  embed.setDescription(replaceMessageTags(embed.data.description));
  embed.setFields(
    ...formInputFields.map((field) => ({
      name: `${ field.label }${ field.required ? ' *' : '' }`,
      value: field.value
    }))
  );

  // Send the application to the channel
  let msg;
  try {
    msg = await applicationChannel.send({
      content: `${ member.user }`,
      embeds: [ embed ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`@application-approve@${ newApplication.index }`)
            .setEmoji('☑️')
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`@application-decline@${ newApplication.index }`)
            .setEmoji('❌')
            .setLabel('Decline')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  }
  catch (err) {
    logger.syserr(`Error encountered while sending application to #${ applicationChannel.name }`);
    logger.printErr(err);
    i.editReply({
      content: `Failed to send application: ${ err.message }`,
      ephemeral: true
    });
    return;
  }

  // Update the application with the message URL
  newApplication.msgUrl = msg.url;
  newApplication.msgId = msg.id;
  settings.applications = [
    ...settings.applications
      .filter((e) => e.index !== newApplicationIndex),
    newApplication
  ];
  guilds.update(settings);

  // Send a confirmation message
  await i.editReply({
    content: 'Your application has been submitted. Please wait for a response from a staff member.',
    ephemeral: true
  });
} });
