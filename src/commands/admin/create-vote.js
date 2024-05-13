const {
  ApplicationCommandOptionType,
  ChannelType,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const { MS_IN_ONE_HOUR } = require('../../constants');
const { humanTimeInputToMS, colorResolver } = require('../../util');
const logger = require('@mirasaki/logger');
const { getGuildSettings, db } = require('../../modules/db');
const { closeVote } = require('../../modules/votes');

module.exports = new ChatInputCommand({
  data: {
    description: 'Create a new prompt for the community to vote on.',
    options: [
      {
        name: 'channel',
        description: 'The channel to create the vote in.',
        type: ApplicationCommandOptionType.Channel,
        required: true,
        channel_types: [ ChannelType.GuildText, ChannelType.GuildAnnouncement ]
      }
      // ...Array.from({ length: 25 - 3 }, (_, i) => ({
      //   name: `option-${ i + 1 }`,
      //   description: `Option ${ i + 1 }`,
      //   type: ApplicationCommandOptionType.String,
      //   required: false
      // }))
    ]
  },
  run: async (client, interaction) => {
    const {
      member, guild, options
    } = interaction;

    const modal = new ModalBuilder()
      .setCustomId('@modal:create-vote')
      .setTitle('Create a new vote')
      .setComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('@modal:create-vote:title')
            .setLabel('Title')
            .setPlaceholder('Vote title')
            .setMinLength(3)
            .setMaxLength(100)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('@modal:create-vote:description')
            .setLabel('Description')
            .setPlaceholder('Vote description')
            .setMinLength(10)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('@modal:create-vote:duration')
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
    const filter = (interaction) => interaction.customId === '@modal:create-vote';
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
    const { votes } = settings;
    const latestVote = votes[0];
    const newVoteIndex = (latestVote?.index ?? 0) + 1;

    // Collect a modal submit interaction
    const channel = options.getChannel('channel', true);
    const title = i.fields.getTextInputValue('@modal:create-vote:title');
    const description = i.fields.getTextInputValue('@modal:create-vote:description');
    const durationRaw = i.fields.getTextInputValue('@modal:create-vote:duration');
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
            .setDescription(description)
            .addFields({
              name: 'Ends In',
              value: `<t:${ dateEndEnoch }:R>`,
              inline: false
            })
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`@vote-yes@${ newVoteIndex }`)
              .setLabel('✔️')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`@vote-no@${ newVoteIndex }`)
              .setLabel('❌')
              .setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }
    catch (err) {
      logger.syserr(`Failed to send vote to channel #${ channel.name }`);
      logger.printErr(err);
      i.reply({
        content: `Failed to send vote to channel ${ channel }: ${ err.message }`,
        ephemeral: true
      });
      return;
    }

    i.reply({
      content: `[Vote](${ msg.url }) created in channel ${ channel }`,
      ephemeral: true
    });

    // Update settings
    const newVote = {
      index: newVoteIndex,
      messageId: msg.id,
      channelId: channel.id,
      userId: member.id,
      ends: dateEnd,
      closed: false,
      upVotes: [],
      downVotes: []
    };
    const guilds = db.getCollection('guilds');
    settings.votes = [ newVote, ...votes ];
    guilds.update(settings);

    // Schedule expiration
    setTimeout(() => {
      const settings = getGuildSettings(guild.id);
      const vote = settings.votes.find((e) => e.index === newVoteIndex);
      if (!vote) return;
      closeVote(client, vote, client.guilds.cache.get(guild.id));
    }, durationInMS);
  }
});
