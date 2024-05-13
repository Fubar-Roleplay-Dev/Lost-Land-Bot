const {
  ApplicationCommandOptionType,
  ChannelType,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const { MS_IN_ONE_HOUR } = require('../../constants');
const {
  humanTimeInputToMS, colorResolver, resolveRowsFromActions, emojifyNumber
} = require('../../util');
const logger = require('@mirasaki/logger');
const { getGuildSettings, db } = require('../../modules/db');
const { stripIndents } = require('common-tags');
const { closePoll } = require('../../modules/polls');

module.exports = new ChatInputCommand({
  data: {
    description: 'Create a new poll for the community to poll on.',
    options: [
      {
        name: 'channel',
        description: 'The channel to create the poll in.',
        type: ApplicationCommandOptionType.Channel,
        required: true,
        channel_types: [ ChannelType.GuildText, ChannelType.GuildAnnouncement ]
      },
      ...Array.from({ length: 25 - 1 }, (_, i) => ({
        name: `option-${ i + 1 }`,
        description: `Option ${ i + 1 }`,
        type: ApplicationCommandOptionType.String,
        required: false
      }))
    ]
  },
  run: async (client, interaction) => {
    const {
      member, guild, options
    } = interaction;

    const pollOptions = options._hoistedOptions
      .filter((e) => e.name.startsWith('option-'))
      .map((e) => e.value);

    if (pollOptions.length < 2) {
      interaction.reply({
        content: 'You must provide at least 2 options for the poll.',
        ephemeral: true
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('@modal:create-poll')
      .setTitle('Create a new poll')
      .setComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('@modal:create-poll:title')
            .setLabel('Title')
            .setPlaceholder('Poll title')
            .setMinLength(3)
            .setMaxLength(100)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('@modal:create-poll:description')
            .setLabel('Description')
            .setPlaceholder('Poll description')
            .setMinLength(10)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('@modal:create-poll:duration')
            .setLabel('Duration')
            .setPlaceholder('2 days, 3 hours, 5 minutes, 10 seconds')
            .setMinLength(1)
            .setMaxLength(255)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    interaction.showModal(modal);

    // Collect a modal submit interaction
    const filter = (interaction) => interaction.customId === '@modal:create-poll';
    let i;
    try {
      i = await interaction.awaitModalSubmit({
        filter, time: MS_IN_ONE_HOUR
      });
    }
    catch {
      // Expired
      return;
    }

    const settings = getGuildSettings(guild.id);
    const { polls } = settings;
    const latestPoll = polls[0];
    const newPollIndex = (latestPoll?.index ?? 0) + 1;

    // Collect a modal submit interaction
    const channel = options.getChannel('channel', true);
    const title = i.fields.getTextInputValue('@modal:create-poll:title');
    const description = i.fields.getTextInputValue('@modal:create-poll:description');
    const durationRaw = i.fields.getTextInputValue('@modal:create-poll:duration');
    const durationInMS = humanTimeInputToMS(durationRaw);
    const dateEnd = new Date(Date.now() + durationInMS);
    const dateEndEnoch = Math.floor(dateEnd.getTime() / 1000);

    let msg;
    try {
      msg = await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(colorResolver())
            .setTitle(title)
            .setDescription(stripIndents`
              ${ description }

              **__Options__**
              ${ pollOptions.map((e, i) => `${ emojifyNumber(i + 1) } | ${ e }`).join('\n') }
            `)
            .addFields({
              name: 'Total Votes',
              value: '0',
              inline: false
            }, {
              name: 'Ends In',
              value: `<t:${ dateEndEnoch }:R>`,
              inline: false
            })
        ],
        components: [
          ...resolveRowsFromActions(
            pollOptions.map((e, ind) => ({
              index: ind,
              buttonText: `${ emojifyNumber(ind + 1) } ${ e }`,
              buttonColor: 'grey'
            })), (action) => `@poll-option@${ newPollIndex }@${ action.index }`
          )
        ]
      });
    }
    catch (err) {
      logger.syserr(`Failed to send poll to channel #${ channel.name }`);
      console.error(err);
      i.reply({
        content: `Failed to send poll to channel ${ channel }: ${ err.message }`,
        ephemeral: true
      });
      return;
    }

    i.reply({
      content: `[Poll](${ msg.url }) created in channel ${ channel }`,
      ephemeral: true
    }).catch();

    // Update settings
    const newPoll = {
      index: newPollIndex,
      messageId: msg.id,
      channelId: channel.id,
      userId: member.id,
      options: pollOptions,
      ends: dateEnd,
      closed: false,
      votes: Object.fromEntries(
        pollOptions.map((e, i) => [ `${ e }`, [] ])
      )
    };
    const guilds = db.getCollection('guilds');
    settings.polls = [ newPoll, ...polls ];
    guilds.update(settings);

    // Schedule expiration
    setTimeout(() => {
      const settings = getGuildSettings(guild.id);
      const poll = settings.polls.find((e) => e.index === newPollIndex);
      if (!poll) return;
      closePoll(client, poll, client.guilds.cache.get(guild.id));
    }, durationInMS);
  }
});
