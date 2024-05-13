const { ApplicationCommandOptionType } = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const { EMBED_DESCRIPTION_MAX_LENGTH } = require('../../constants');
const { requiredServerConfigCommandOption, getServerConfigCommandOptionValue } = require('../../modules/cftClient');
const logger = require('@mirasaki/logger');
const { colorResolver } = require('../../util');

module.exports = new ChatInputCommand({
  data: {
    description: 'Broadcast a radio signal',
    options: [
      requiredServerConfigCommandOption,
      {
        name: 'description',
        description: 'Description of the radio signal - what are you broadcasting?',
        type: ApplicationCommandOptionType.String,
        required: true,
        min_length: 10,
        max_length: EMBED_DESCRIPTION_MAX_LENGTH
      }
    ]
  },
  run: async (client, interaction) => {
    const {
      guild, member, options
    } = interaction;
    const { emojis } = client.container;

    await interaction.deferReply({ ephemeral: true });

    const serverCfg = getServerConfigCommandOptionValue(interaction);
    const description = options.getString('description');
    const embed = {
      ...serverCfg.RADIO_EMBED,
      color: colorResolver(serverCfg.RADIO_EMBED?.color),
      title: 'Radio Transmission Incoming',
      description
    };

    const channel = guild.channels.cache.get(serverCfg.RADIO_CHANNEL_ID);
    if (!channel) {
      interaction.editReply(`${ emojis.error } ${ member }, the radio channel is not available on this server.`);
      return;
    }

    const msg = await channel.send({ embeds: [ embed ] })
      .catch((err) => {
        logger.syserr('Error encountered while sending radio transmission');
        logger.printErr(err);
      });

    if (!msg) {
      interaction.editReply(`${ emojis.error } ${ member }, the radio channel is not available on this server.`);
      return;
    }

    interaction.editReply(`${ emojis.success } ${ member }, your [radio transmission](<${ msg.url }>) has been sent.`);
  }
});
