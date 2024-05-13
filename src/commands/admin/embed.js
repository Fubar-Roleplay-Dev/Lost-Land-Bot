const { ApplicationCommandOptionType } = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const { extractDiscoHookData } = require('../../util');


module.exports = new ChatInputCommand({
  global: true,
  permLevel: 'Administrator',
  data: {
    description: 'Manage reaction-roles for your server',
    options: [
      {
        name: 'discohook-export',
        description: 'Your DiscoHook export file',
        type: ApplicationCommandOptionType.Attachment,
        required: true
      }
    ]
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    const {
      member, options, channel
    } = interaction;
    const { emojis } = client.container;
    const attachment = options.getAttachment('discohook-export', true);

    await interaction.deferReply({ ephemeral: true });

    const response = await fetch(attachment.url);
    const data = await response.text();
    const ctx = extractDiscoHookData(interaction, data);
    if (!ctx || !ctx[0]) {
      interaction.editReply(`${ emojis.error } ${ member }, unable to parse JSON content, please make sure you're using the correct export and try again - this command has been cancelled`);
      return;
    }

    for (const msg of ctx) {
      channel.send(msg).catch((err) => {
        interaction.followUp({
          content: `Unable to send DiscoHook message #${ (ctx.indexOf(msg) ?? 0) + 1 }: ${ err.message }`,
          ephemeral: true
        });
      });
    }

    interaction.deleteReply();
  }
});
